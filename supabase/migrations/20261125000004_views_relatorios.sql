-- =============================================================================
-- Migration 4: telas prontas (views) para o front e relatórios do dono
-- Todas usam security_invoker: respeitam as regras de acesso de quem consulta
-- (ex.: garçom não enxerga valores de pagamentos).
-- Datas "do dia" usam o fuso configurado (padrão America/Fortaleza = Maranhão).
-- =============================================================================

-- Mapa de mesas (livre / ocupada, total da conta, há quanto tempo)
create view vw_mesas with (security_invoker = true) as
select
  m.id            as mesa_id,
  m.numero,
  m.descricao,
  m.lugares,
  p.id            as pedido_id,
  p.numero        as pedido_numero,
  (p.id is not null) as ocupada,
  p.pessoas,
  p.total,
  p.total_pago,
  p.aberto_em,
  floor(extract(epoch from now() - p.aberto_em) / 60)::int as minutos_aberta,
  g.nome          as garcom
from mesas m
left join pedidos p on p.mesa_id = m.id and p.status = 'aberto'
left join perfis  g on g.id = p.garcom_id
where m.ativa;

-- Comandas abertas (balcão, delivery, apps e mesas)
create view vw_pedidos_abertos with (security_invoker = true) as
select
  p.id, p.numero, p.tipo, p.status,
  m.numero as mesa_numero,
  coalesce(c.nome, p.nome_cliente) as cliente,
  p.subtotal, p.desconto, p.taxa_servico, p.taxa_entrega, p.total, p.total_pago,
  p.total - p.total_pago as restante,
  p.aberto_em,
  floor(extract(epoch from now() - p.aberto_em) / 60)::int as minutos_aberto,
  g.nome as garcom,
  (select count(*) from pedido_itens i where i.pedido_id = p.id and i.status <> 'cancelado') as qtd_itens
from pedidos p
left join mesas    m on m.id = p.mesa_id
left join clientes c on c.id = p.cliente_id
left join perfis   g on g.id = p.garcom_id
where p.status = 'aberto';

-- Painel da cozinha / bar (KDS)
create view vw_kds with (security_invoker = true) as
select
  i.id            as item_id,
  i.pedido_id,
  p.numero        as pedido_numero,
  p.tipo          as pedido_tipo,
  m.numero        as mesa_numero,
  coalesce(c.nome, p.nome_cliente) as cliente,
  i.setor,
  i.nome_produto,
  i.quantidade,
  i.observacao,
  (select string_agg(a.nome, ', ' order by a.nome) from pedido_item_adicionais a where a.item_id = i.id) as adicionais,
  i.status,
  i.created_at    as pedido_em,
  i.preparo_iniciado_em,
  i.pronto_em,
  floor(extract(epoch from now() - i.created_at) / 60)::int as minutos_espera
from pedido_itens i
join pedidos p       on p.id = i.pedido_id
left join mesas m    on m.id = p.mesa_id
left join clientes c on c.id = p.cliente_id
where i.status in ('pendente', 'preparando', 'pronto')
  and i.setor <> 'nenhum'
  and p.status <> 'cancelado'
  and i.created_at > now() - interval '12 hours';

-- Saldo de fiado por cliente
create view vw_fiado_saldos with (security_invoker = true) as
select
  c.id as cliente_id, c.nome, c.telefone, c.limite_fiado,
  sum(l.valor)        as saldo,
  max(l.created_at)   as ultimo_lancamento,
  max(l.created_at) filter (where l.tipo = 'pagamento') as ultimo_pagamento
from clientes c
join fiado_lancamentos l on l.cliente_id = c.id
group by c.id
having sum(l.valor) <> 0;

-- Vendas por dia (pedidos fechados)
create view vw_vendas_diarias with (security_invoker = true) as
select
  (p.fechado_em at time zone cfg.fuso_horario)::date as dia,
  count(*)                                as pedidos,
  sum(p.subtotal)                         as subtotal,
  sum(p.desconto)                         as descontos,
  sum(p.taxa_servico)                     as taxa_servico,
  sum(p.taxa_entrega)                     as taxa_entrega,
  sum(p.total)                            as faturamento,
  round(avg(p.total), 2)                  as ticket_medio,
  count(*) filter (where p.tipo = 'mesa')     as pedidos_mesa,
  count(*) filter (where p.tipo = 'balcao')   as pedidos_balcao,
  count(*) filter (where p.tipo = 'delivery') as pedidos_delivery,
  count(*) filter (where p.tipo in ('ifood', '99food')) as pedidos_apps
from pedidos p
cross join configuracoes cfg
where p.status = 'fechado'
group by 1;

-- Vendas por forma de pagamento por dia
create view vw_vendas_por_forma with (security_invoker = true) as
select
  (pg.created_at at time zone cfg.fuso_horario)::date as dia,
  f.id as forma_pagamento_id, f.nome as forma, f.tipo,
  count(*)      as quantidade,
  sum(pg.valor) as total
from pagamentos pg
join formas_pagamento f on f.id = pg.forma_pagamento_id
cross join configuracoes cfg
where not pg.estornado
group by 1, 2, 3, 4;

-- Produtos vendidos por dia (ranking, curva ABC, margem)
create view vw_produtos_vendidos with (security_invoker = true) as
select
  (p.fechado_em at time zone cfg.fuso_horario)::date as dia,
  i.produto_id,
  pr.nome as produto,
  c.nome  as categoria,
  sum(i.quantidade) as quantidade,
  sum(i.subtotal)   as faturamento,
  sum(i.quantidade * pr.custo) as custo_estimado
from pedido_itens i
join pedidos p     on p.id = i.pedido_id and p.status = 'fechado'
join produtos pr   on pr.id = i.produto_id
join categorias c  on c.id = pr.categoria_id
cross join configuracoes cfg
where i.status <> 'cancelado'
group by 1, 2, 3, 4;

-- Resumo de cada caixa (para a tela de fechamento)
create view vw_resumo_caixas with (security_invoker = true) as
select
  cx.id as caixa_id, cx.status, cx.aberto_em, cx.fechado_em,
  ab.nome as aberto_por, fe.nome as fechado_por,
  cx.valor_abertura,
  coalesce((select sum(pg.valor) from pagamentos pg where pg.caixa_id = cx.id and not pg.estornado), 0) as total_vendas,
  coalesce((select jsonb_object_agg(x.forma, x.total) from (
      select f.nome as forma, sum(pg.valor) as total
      from pagamentos pg join formas_pagamento f on f.id = pg.forma_pagamento_id
      where pg.caixa_id = cx.id and not pg.estornado group by f.nome) x), '{}'::jsonb) as vendas_por_forma,
  coalesce((select sum(-l.valor) from fiado_lancamentos l where l.caixa_id = cx.id and l.tipo = 'pagamento'), 0) as fiado_recebido,
  coalesce((select sum(m.valor) from movimentos_caixa m where m.caixa_id = cx.id and m.tipo = 'suprimento'), 0) as suprimentos,
  coalesce((select sum(m.valor) from movimentos_caixa m where m.caixa_id = cx.id and m.tipo = 'sangria'), 0) as sangrias,
  coalesce((select sum(d.valor_pago) from despesas d where d.caixa_id = cx.id), 0) as despesas_pagas_no_caixa,
  case when cx.status = 'aberto' then calcular_dinheiro_esperado(cx.id) else cx.dinheiro_esperado end as dinheiro_esperado,
  cx.dinheiro_informado,
  cx.diferenca
from caixas cx
join perfis ab      on ab.id = cx.aberto_por
left join perfis fe on fe.id = cx.fechado_por;

-- Contas a pagar em aberto
create view vw_contas_a_pagar with (security_invoker = true) as
select
  d.id, d.descricao, cd.nome as categoria, fo.nome as fornecedor, d.valor, d.vencimento,
  case
    when d.vencimento <  (now() at time zone cfg.fuso_horario)::date then 'vencida'
    when d.vencimento =  (now() at time zone cfg.fuso_horario)::date then 'vence_hoje'
    when d.vencimento <= (now() at time zone cfg.fuso_horario)::date + 7 then 'proximos_7_dias'
    else 'a_vencer'
  end as situacao
from despesas d
left join categorias_despesa cd on cd.id = d.categoria_id
left join fornecedores fo       on fo.id = d.fornecedor_id
cross join configuracoes cfg
where d.pago_em is null;

-- Painel do dono: os números do dia numa linha só
create view vw_painel_hoje with (security_invoker = true) as
with hoje as (
  select (now() at time zone fuso_horario)::date as dia, fuso_horario as tz from configuracoes
)
select
  h.dia,
  coalesce((select sum(p.total) from pedidos p
            where p.status = 'fechado' and (p.fechado_em at time zone h.tz)::date = h.dia), 0)   as vendas_hoje,
  (select count(*) from pedidos p
    where p.status = 'fechado' and (p.fechado_em at time zone h.tz)::date = h.dia)               as pedidos_hoje,
  coalesce((select round(avg(p.total), 2) from pedidos p
            where p.status = 'fechado' and (p.fechado_em at time zone h.tz)::date = h.dia), 0)   as ticket_medio_hoje,
  (select count(*) from pedidos p where p.status = 'aberto')                                     as comandas_abertas,
  coalesce((select sum(p.total - p.total_pago) from pedidos p where p.status = 'aberto'), 0)     as valor_em_aberto,
  (select count(*) from pedidos p where p.status = 'aberto' and p.aberto_em < now() - interval '3 hours')
                                                                                                 as comandas_esquecidas,
  coalesce((select sum(valor) from fiado_lancamentos), 0)                                        as fiado_a_receber,
  coalesce((select sum(d.valor) from despesas d where d.pago_em is null and d.vencimento <= h.dia + 7), 0)
                                                                                                 as contas_proximos_7_dias,
  (select status from caixas where status = 'aberto')                                            as caixa
from hoje h;

revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
