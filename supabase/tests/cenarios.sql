-- Cenários de teste do dia a dia. Rodar com: ./supabase/tests/rodar_testes.sh
\set ON_ERROR_STOP on
\set QUIET on

-- Usuários (como superusuário, simulando o cadastro no Supabase Auth)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000d0d0', 'dono@casavinte.test',    '{"nome":"Dono"}'),
  ('00000000-0000-0000-0000-00000000ca1a', 'caixa@casavinte.test',   '{"nome":"Ana Caixa"}'),
  ('00000000-0000-0000-0000-0000000060a0', 'garcom@casavinte.test',  '{"nome":"João Garçom"}'),
  ('00000000-0000-0000-0000-00000000c021', 'cozinha@casavinte.test', '{"nome":"Cozinha"}'),
  ('00000000-0000-0000-0000-0000000000ff', 'intruso@x.test',         '{"nome":"Intruso"}');

do $$
begin
  assert (select papel from perfis where id = '00000000-0000-0000-0000-00000000d0d0') = 'dono', 'primeiro usuário deve ser dono';
  assert (select ativo from perfis where id = '00000000-0000-0000-0000-00000000d0d0'), 'dono deve estar ativo';
  assert not (select ativo from perfis where id = '00000000-0000-0000-0000-00000000ca1a'), 'demais entram inativos';
  raise notice 'OK  primeiro usuário vira dono; demais entram inativos';
end $$;

-- Função auxiliar de teste: espera que um comando falhe
create function pg_temp.deve_falhar(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ERA PARA FALHAR: %', p_sql;
exception when others then
  if sqlerrm like 'ERA PARA FALHAR%' then raise; end if;
  if position(lower(p_trecho) in lower(sqlerrm)) = 0 then
    raise exception 'Falhou com mensagem inesperada: % (esperado: %)', sqlerrm, p_trecho;
  end if;
end $$;
grant execute on function pg_temp.deve_falhar(text, text) to authenticated;

-- ===== Dono libera a equipe =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d0d0';
update perfis set papel = 'caixa',   ativo = true where id = '00000000-0000-0000-0000-00000000ca1a';
update perfis set papel = 'garcom',  ativo = true where id = '00000000-0000-0000-0000-0000000060a0';
update perfis set papel = 'cozinha', ativo = true where id = '00000000-0000-0000-0000-00000000c021';
-- cadastro de mais produtos e um adicional
insert into produtos (categoria_id, codigo, nome, preco, unidade)
  select id, 'REF01', 'Refrigerante lata', 6.00, 'UN' from categorias where nome = 'Bebidas';
insert into produtos (categoria_id, codigo, nome, preco, unidade, custo)
  select id, 'PIC01', 'Picanha na chapa (kg)', 120.00, 'KG', 70 from categorias where nome = 'Grelhados Casa';
insert into adicionais (nome, preco) values ('Ovo frito', 3.00);
insert into produto_adicionais select p.id, a.id from produtos p, adicionais a where p.codigo = 'EXE01' and a.nome = 'Ovo frito';
insert into clientes (nome, telefone, limite_fiado) values ('Seu Raimundo', '99999-0000', 100);
reset role;
do $$ begin raise notice 'OK  dono libera usuários e cadastra cardápio'; end $$;

-- ===== Intruso (inativo) não faz nada =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
select pg_temp.deve_falhar($$select abrir_pedido('balcao')$$, 'sem acesso');
do $$ begin
  assert (select count(*) from produtos) = 0, 'inativo não deve ver o cardápio';
  raise notice 'OK  usuário inativo bloqueado (não vê nem grava)';
end $$;
reset role;

-- ===== Garçom não pode mexer no cardápio nem ver pagamentos =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000060a0';
update produtos set preco = 1;  -- RLS: não afeta nenhuma linha
reset role;
do $$ begin
  assert not exists (select 1 from produtos where preco = 1), 'garçom não pode alterar preço';
  raise notice 'OK  garçom não altera o cardápio';
end $$;

-- ===== Fluxo de um dia =====
set role authenticated;
-- Caixa: não recebe sem caixa aberto
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca1a';
select (abrir_caixa(100)).status as caixa_aberto \gset
select pg_temp.deve_falhar($$select abrir_caixa(50)$$, 'já existe um caixa aberto');

-- Garçom abre mesa 5 e lança itens
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000060a0';
select (abrir_pedido('mesa', (select id from mesas where numero = 5), p_pessoas => 2)).id as pedido_mesa \gset
select pg_temp.deve_falhar(format($$select abrir_pedido('mesa', '%s')$$, (select id from mesas where numero = 5)), 'já tem uma comanda');
select (adicionar_item(:'pedido_mesa', (select id from produtos where codigo = 'EXE01'), 2,
        array[(select id from adicionais where nome = 'Ovo frito')], 'sem cebola')).id as item_exec \gset
select (adicionar_item(:'pedido_mesa', (select id from produtos where codigo = 'REF01'), 2)).id as item_refri \gset
select (adicionar_item(:'pedido_mesa', (select id from produtos where codigo = 'PIC01'), 0.45)).id as item_pic \gset
select pg_temp.deve_falhar(format($$select adicionar_item('%s', '%s', 1.5)$$, :'pedido_mesa',
        (select id from produtos where codigo = 'REF01')), 'por unidade');
reset role;

-- conferência de valores: 2x(26,50+3) + 2x6 + 0,45x120 = 59 + 12 + 54 = 125 ; serviço 10% = 12,50 ; total 137,50
do $$
declare p record;
begin
  select * into p from pedidos where status = 'aberto' and tipo = 'mesa';
  assert p.subtotal = 125.00,     format('subtotal esperado 125, veio %s', p.subtotal);
  assert p.taxa_servico = 12.50,  format('serviço esperado 12.50, veio %s', p.taxa_servico);
  assert p.total = 137.50,        format('total esperado 137.50, veio %s', p.total);
  assert (select status from pedido_itens where nome_produto = 'Refrigerante lata') = 'entregue', 'bebida não vai para a cozinha';
  raise notice 'OK  comanda de mesa: itens, adicional, peso (kg), taxa de serviço = R$ %', p.total;
end $$;

-- Cozinha vê no KDS e atualiza status
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c021';
do $$ begin
  assert (select count(*) from vw_kds) = 2, format('KDS deveria ter 2 itens, tem %s', (select count(*) from vw_kds));
  assert (select adicionais from vw_kds where nome_produto = 'Executivo da Casa') = 'Ovo frito';
  assert (select count(*) from pagamentos) = 0;
  raise notice 'OK  KDS mostra 2 itens da cozinha (bebida fica fora); cozinha não vê pagamentos';
end $$;
select atualizar_status_item(:'item_exec', 'preparando');
select atualizar_status_item(:'item_exec', 'pronto');
select pg_temp.deve_falhar(format($$select abrir_pedido('balcao')$$), 'não pode');
-- Garçom tenta cancelar item que já está pronto -> bloqueado
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000060a0';
select pg_temp.deve_falhar(format($$select cancelar_item('%s', 'cliente desistiu')$$, :'item_exec'), 'gerente ou caixa');
-- Caixa cancela a picanha
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca1a';
select cancelar_item(:'item_pic', 'cliente desistiu');
-- Desconto acima do limite (10% de 71 = 7,10) bloqueado para o caixa
select pg_temp.deve_falhar(format($$select aplicar_desconto('%s', 20)$$, :'pedido_mesa'), 'limite');
select aplicar_desconto(:'pedido_mesa', 5, 'cliente frequente');
reset role;

do $$
declare p record;
begin
  select * into p from pedidos where status = 'aberto' and tipo = 'mesa';
  -- subtotal 71 ; desconto 5 ; serviço 7,10 ; total 73,10
  assert p.total = 73.10, format('total esperado 73.10, veio %s', p.total);
  assert exists (select 1 from auditoria where acao = 'cancelar_item'), 'cancelamento auditado';
  assert exists (select 1 from auditoria where acao = 'desconto'), 'desconto auditado';
  raise notice 'OK  cancelamento + desconto recalculam: total R$ % (auditados)', p.total;
end $$;

-- Pagamento dividido: Pix 40 + dinheiro 33,10 (cliente entrega 50)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca1a';
select pg_temp.deve_falhar(format($$select registrar_pagamento('%s', '%s', 100)$$, :'pedido_mesa',
        (select id from formas_pagamento where nome = 'Pix')), 'maior que o restante');
select registrar_pagamento(:'pedido_mesa', (select id from formas_pagamento where nome = 'Pix'), 40);
select registrar_pagamento(:'pedido_mesa', (select id from formas_pagamento where nome = 'Dinheiro'), 33.10, 50);
reset role;
do $$
declare p record;
begin
  select * into p from pedidos where tipo = 'mesa';
  assert p.status = 'fechado', 'comanda deveria fechar ao quitar';
  assert (select troco from pagamentos where valor_recebido = 50) = 16.90, 'troco 16,90';
  assert (select ocupada from vw_mesas where numero = 5) = false, 'mesa 5 liberada';
  raise notice 'OK  pagamento dividido fecha a comanda, calcula troco e libera a mesa';
end $$;

-- Balcão no fiado com limite
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca1a';
select (abrir_pedido('balcao', p_cliente_id => (select id from clientes where nome = 'Seu Raimundo'))).id as pedido_fiado \gset
select adicionar_item(:'pedido_fiado', (select id from produtos where codigo = 'EXE01'), 3);  -- 79,50
select registrar_pagamento(:'pedido_fiado', (select id from formas_pagamento where nome = 'Fiado'), 79.50);
select (abrir_pedido('balcao', p_cliente_id => (select id from clientes where nome = 'Seu Raimundo'))).id as pedido_fiado2 \gset
select adicionar_item(:'pedido_fiado2', (select id from produtos where codigo = 'EXE01'), 1);
select pg_temp.deve_falhar(format($$select registrar_pagamento('%s', '%s', 26.50)$$, :'pedido_fiado2',
        (select id from formas_pagamento where nome = 'Fiado')), 'limite de fiado');
-- cliente paga 50 do fiado em dinheiro
select receber_fiado((select id from clientes where nome = 'Seu Raimundo'), 50,
                     (select id from formas_pagamento where nome = 'Dinheiro'));
select registrar_pagamento(:'pedido_fiado2', (select id from formas_pagamento where nome = 'Fiado'), 26.50);
do $$ begin
  assert (select saldo from vw_fiado_saldos where nome = 'Seu Raimundo') = 56.00, 'saldo fiado 79,50 - 50 + 26,50 = 56';
  raise notice 'OK  fiado: limite respeitado, recebimento e saldo (R$ 56,00)';
end $$;

-- Sangria e fechamento de caixa
select registrar_movimento_caixa('sangria', 30, 'depósito no banco');
select (fechar_caixa(200, 'fechamento do almoço')).diferenca as diferenca \gset
reset role;
do $$
declare c record;
begin
  select * into c from caixas;
  -- 100 abertura + 33,10 dinheiro (pedido) + 50 fiado recebido - 30 sangria = 153,10
  assert c.dinheiro_esperado = 153.10, format('esperado 153.10, veio %s', c.dinheiro_esperado);
  assert c.diferenca = 46.90, format('diferença 46.90, veio %s', c.diferenca);
  assert exists (select 1 from auditoria where acao = 'caixa_com_diferenca');
  raise notice 'OK  fechamento de caixa: esperado R$ %, diferença R$ % auditada', c.dinheiro_esperado, c.diferenca;
end $$;

-- Sem caixa aberto não recebe
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ca1a';
select (abrir_pedido('delivery', p_nome_cliente => 'Maria')).id as pedido_deliv \gset
select adicionar_item(:'pedido_deliv', (select id from produtos where codigo = 'EXE01'), 1);
select pg_temp.deve_falhar(format($$select registrar_pagamento('%s', '%s', 26.50)$$, :'pedido_deliv',
        (select id from formas_pagamento where nome = 'Pix')), 'nenhum caixa aberto');
-- caixa não pode cancelar pedido; dono pode
select pg_temp.deve_falhar(format($$select cancelar_pedido('%s', 'teste')$$, :'pedido_deliv'), 'não pode');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000d0d0';
select cancelar_pedido(:'pedido_deliv', 'pedido de teste');

-- Relatórios do dono
do $$ begin
  assert (select pedidos from vw_vendas_diarias) = 3, 'vendas do dia: 3 pedidos fechados';
  assert (select faturamento from vw_vendas_diarias) = 179.10, format('faturamento 179.10, veio %s', (select faturamento from vw_vendas_diarias));
  assert (select total from vw_vendas_por_forma where forma = 'Fiado') = 106.00;
  assert (select quantidade from vw_produtos_vendidos where produto = 'Executivo da Casa') = 6;
  assert (select vendas_hoje from vw_painel_hoje) = 179.10;
  raise notice 'OK  relatórios: faturamento do dia R$ 179,10 em 3 pedidos; ranking e formas de pagamento';
end $$;
-- despesa paga só pela função
insert into despesas (descricao, valor, vencimento) values ('Gás', 120, current_date);
select pg_temp.deve_falhar($$update despesas set pago_em = now(), valor_pago = 120$$, 'permission denied');
select pagar_despesa((select id from despesas), (select id from formas_pagamento where nome = 'Pix'));
do $$ begin
  assert (select count(*) from vw_contas_a_pagar) = 0;
  raise notice 'OK  despesa só é marcada como paga pela função pagar_despesa';
end $$;
-- Visitante sem login não vê nada
reset role;
set role anon;
select pg_temp.deve_falhar($$select * from produtos$$, 'permission denied');
reset role;
do $$ begin raise notice 'OK  visitante sem login (anon) bloqueado'; end $$;
\echo '=== TODOS OS CENÁRIOS PASSARAM ==='
