-- =============================================================================
-- Migration 2: regras de negócio
-- Toda operação que mexe com dinheiro ou com várias tabelas ao mesmo tempo é
-- feita por uma função (RPC). Assim a regra vale igual para o PDV, o celular do
-- garçom e qualquer tela futura, e tudo acontece numa única transação.
-- O front chama:  supabase.rpc('nome_da_funcao', { p_param: valor })
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de usuário / permissão
-- -----------------------------------------------------------------------------
create or replace function meu_papel() returns papel_usuario
language sql stable security definer set search_path = public, pg_temp as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function exigir_papel(variadic p_papeis papel_usuario[]) returns papel_usuario
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_papel papel_usuario := meu_papel();
begin
  if v_papel is null then
    raise exception 'Usuário sem acesso ou inativo' using errcode = '42501';
  end if;
  if not (v_papel = any (p_papeis)) then
    raise exception 'Seu perfil (%) não pode fazer esta operação', v_papel using errcode = '42501';
  end if;
  return v_papel;
end $$;

create or replace function registrar_auditoria(p_acao text, p_tabela text, p_registro uuid, p_dados jsonb default null)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into auditoria (usuario_id, acao, tabela, registro_id, dados)
  values (auth.uid(), p_acao, p_tabela, p_registro, p_dados)
$$;

-- Cria o perfil quando alguém é cadastrado no Supabase Auth.
-- O PRIMEIRO usuário vira "dono" e já fica ativo. Os demais entram como
-- "garcom" INATIVO até o dono liberar (o papel nunca vem do cadastro, por segurança).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_primeiro boolean;
begin
  perform pg_advisory_xact_lock(hashtext('perfis_primeiro_usuario'));
  select not exists (select 1 from perfis) into v_primeiro;
  insert into perfis (id, nome, papel, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, 'usuario'), '@', 1)),
    case when v_primeiro then 'dono'::papel_usuario else 'garcom'::papel_usuario end,
    v_primeiro
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- Caixa
-- -----------------------------------------------------------------------------
create or replace function caixa_aberto_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from caixas where status = 'aberto'
$$;

create or replace function exigir_caixa_aberto() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := caixa_aberto_id();
begin
  if v_id is null then
    raise exception 'Nenhum caixa aberto. Abra o caixa antes de receber pagamentos.' using errcode = 'P0001';
  end if;
  return v_id;
end $$;

-- Quanto deveria ter de DINHEIRO na gaveta para um caixa
create or replace function calcular_dinheiro_esperado(p_caixa uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select
      c.valor_abertura
    + coalesce((select sum(p.valor) from pagamentos p
                join formas_pagamento f on f.id = p.forma_pagamento_id
                where p.caixa_id = c.id and not p.estornado and f.tipo = 'dinheiro'), 0)
    + coalesce((select sum(-l.valor) from fiado_lancamentos l
                join formas_pagamento f on f.id = l.forma_pagamento_id
                where l.caixa_id = c.id and l.tipo = 'pagamento' and f.tipo = 'dinheiro'), 0)
    + coalesce((select sum(m.valor) from movimentos_caixa m where m.caixa_id = c.id and m.tipo = 'suprimento'), 0)
    - coalesce((select sum(m.valor) from movimentos_caixa m where m.caixa_id = c.id and m.tipo = 'sangria'), 0)
    - coalesce((select sum(d.valor_pago) from despesas d
                join formas_pagamento f on f.id = d.forma_pagamento_id
                where d.caixa_id = c.id and f.tipo = 'dinheiro'), 0)
  from caixas c where c.id = p_caixa
$$;

create or replace function abrir_caixa(p_valor_abertura numeric default 0, p_observacoes text default null)
returns caixas
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caixa caixas;
begin
  perform exigir_papel('dono', 'gerente', 'caixa');
  if caixa_aberto_id() is not null then
    raise exception 'Já existe um caixa aberto.' using errcode = 'P0001';
  end if;
  insert into caixas (aberto_por, valor_abertura, observacoes)
  values (auth.uid(), coalesce(p_valor_abertura, 0), p_observacoes)
  returning * into v_caixa;
  return v_caixa;
end $$;

create or replace function registrar_movimento_caixa(p_tipo tipo_mov_caixa, p_valor numeric, p_motivo text)
returns movimentos_caixa
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mov movimentos_caixa;
begin
  perform exigir_papel('dono', 'gerente', 'caixa');
  insert into movimentos_caixa (caixa_id, tipo, valor, motivo, usuario_id)
  values (exigir_caixa_aberto(), p_tipo, p_valor, p_motivo, auth.uid())
  returning * into v_mov;
  return v_mov;
end $$;

create or replace function fechar_caixa(p_dinheiro_informado numeric, p_observacoes text default null)
returns caixas
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id      uuid;
  v_espera  numeric;
  v_caixa   caixas;
begin
  perform exigir_papel('dono', 'gerente', 'caixa');
  v_id := exigir_caixa_aberto();
  v_espera := calcular_dinheiro_esperado(v_id);

  update caixas set
    status             = 'fechado',
    fechado_por        = auth.uid(),
    fechado_em         = now(),
    dinheiro_esperado  = v_espera,
    dinheiro_informado = p_dinheiro_informado,
    diferenca          = p_dinheiro_informado - v_espera,
    observacoes        = coalesce(p_observacoes, observacoes)
  where id = v_id
  returning * into v_caixa;

  if v_caixa.diferenca <> 0 then
    perform registrar_auditoria('caixa_com_diferenca', 'caixas', v_id,
      jsonb_build_object('esperado', v_espera, 'informado', p_dinheiro_informado, 'diferenca', v_caixa.diferenca));
  end if;
  return v_caixa;
end $$;

-- -----------------------------------------------------------------------------
-- Pedidos: recálculo de valores
-- -----------------------------------------------------------------------------
create or replace function recalcular_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pct numeric := (select taxa_servico_percentual from configuracoes where id = 1);
begin
  update pedidos p set
    subtotal = s.subtotal,
    taxa_servico = case when p.tipo = 'mesa' and p.cobrar_servico
                        then round(s.subtotal * coalesce(v_pct, 0) / 100, 2) else 0 end,
    total = greatest(
              s.subtotal - p.desconto
              + case when p.tipo = 'mesa' and p.cobrar_servico
                     then round(s.subtotal * coalesce(v_pct, 0) / 100, 2) else 0 end
              + p.taxa_entrega, 0),
    total_pago = s.pago
  from (
    select
      coalesce((select sum(subtotal) from pedido_itens where pedido_id = p_pedido and status <> 'cancelado'), 0) as subtotal,
      coalesce((select sum(valor) from pagamentos where pedido_id = p_pedido and not estornado), 0) as pago
  ) s
  where p.id = p_pedido;
end $$;

create or replace function trg_recalcular_pedido() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform recalcular_pedido(coalesce(new.pedido_id, old.pedido_id));
  return null;
end $$;

create trigger trg_itens_recalcula
  after insert or update or delete on pedido_itens
  for each row execute function trg_recalcular_pedido();

create trigger trg_pagamentos_recalcula
  after insert or update or delete on pagamentos
  for each row execute function trg_recalcular_pedido();

create or replace function buscar_pedido_aberto(p_pedido uuid) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v pedidos;
begin
  select * into v from pedidos where id = p_pedido for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v.status <> 'aberto' then
    raise exception 'O pedido % não está aberto (status: %)', v.numero, v.status using errcode = 'P0001';
  end if;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Pedidos: abrir, itens, desconto, taxas, mesa
-- -----------------------------------------------------------------------------
create or replace function abrir_pedido(
  p_tipo          tipo_pedido,
  p_mesa_id       uuid default null,
  p_cliente_id    uuid default null,
  p_nome_cliente  text default null,
  p_pessoas       int  default null,
  p_observacoes   text default null,
  p_codigo_externo text default null
) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_papel  papel_usuario;
  v_pedido pedidos;
begin
  v_papel := exigir_papel('dono', 'gerente', 'caixa', 'garcom');

  if p_tipo = 'mesa' then
    if p_mesa_id is null then
      raise exception 'Informe a mesa' using errcode = 'P0001';
    end if;
    if not exists (select 1 from mesas where id = p_mesa_id and ativa) then
      raise exception 'Mesa inexistente ou inativa' using errcode = 'P0001';
    end if;
    if exists (select 1 from pedidos where mesa_id = p_mesa_id and status = 'aberto') then
      raise exception 'Esta mesa já tem uma comanda aberta' using errcode = 'P0001';
    end if;
  elsif p_mesa_id is not null then
    raise exception 'Mesa só pode ser informada em pedidos do tipo mesa' using errcode = 'P0001';
  end if;

  insert into pedidos (tipo, mesa_id, cliente_id, nome_cliente, pessoas, observacoes,
                       garcom_id, aberto_por, codigo_externo, cobrar_servico)
  values (p_tipo, p_mesa_id, p_cliente_id, p_nome_cliente, p_pessoas, p_observacoes,
          case when v_papel = 'garcom' then auth.uid() end, auth.uid(), p_codigo_externo,
          p_tipo = 'mesa')
  returning * into v_pedido;
  return v_pedido;
end $$;

create or replace function adicionar_item(
  p_pedido      uuid,
  p_produto     uuid,
  p_quantidade  numeric default 1,
  p_adicionais  uuid[]  default '{}',
  p_observacao  text    default null
) returns pedido_itens
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prod      record;
  v_valor_ad  numeric;
  v_item      pedido_itens;
begin
  perform exigir_papel('dono', 'gerente', 'caixa', 'garcom');
  perform buscar_pedido_aberto(p_pedido);

  select pr.*, coalesce(pr.setor, c.setor) as setor_final
    into v_prod
    from produtos pr join categorias c on c.id = pr.categoria_id
   where pr.id = p_produto;

  if not found or not v_prod.ativo then
    raise exception 'Produto não encontrado ou fora do cardápio' using errcode = 'P0001';
  end if;
  if not v_prod.disponivel then
    raise exception '"%" está esgotado', v_prod.nome using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade inválida' using errcode = 'P0001';
  end if;
  if v_prod.unidade = 'UN' and p_quantidade <> trunc(p_quantidade) then
    raise exception '"%" é vendido por unidade; use quantidade inteira', v_prod.nome using errcode = 'P0001';
  end if;

  -- só aceita adicionais ativos e vinculados ao produto
  if coalesce(array_length(p_adicionais, 1), 0) > 0 and exists (
       select 1 from unnest(p_adicionais) a(id)
       where not exists (select 1 from produto_adicionais pa join adicionais ad on ad.id = pa.adicional_id
                         where pa.produto_id = p_produto and pa.adicional_id = a.id and ad.ativo)) then
    raise exception 'Adicional inválido para este produto' using errcode = 'P0001';
  end if;

  select coalesce(sum(ad.preco), 0) into v_valor_ad
    from unnest(p_adicionais) a(id) join adicionais ad on ad.id = a.id;

  insert into pedido_itens (pedido_id, produto_id, nome_produto, preco_unitario, valor_adicionais,
                            quantidade, observacao, setor, criado_por,
                            status)
  values (p_pedido, p_produto, v_prod.nome, v_prod.preco, v_valor_ad,
          p_quantidade, p_observacao, v_prod.setor_final, auth.uid(),
          case when v_prod.setor_final = 'nenhum' then 'entregue'::status_item else 'pendente'::status_item end)
  returning * into v_item;

  insert into pedido_item_adicionais (item_id, adicional_id, nome, preco)
  select v_item.id, ad.id, ad.nome, ad.preco
    from unnest(p_adicionais) a(id) join adicionais ad on ad.id = a.id;

  return v_item;
end $$;

create or replace function cancelar_item(p_item uuid, p_motivo text) returns pedido_itens
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_papel papel_usuario;
  v_item  pedido_itens;
begin
  v_papel := exigir_papel('dono', 'gerente', 'caixa', 'garcom');
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento' using errcode = 'P0001';
  end if;

  select * into v_item from pedido_itens where id = p_item for update;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  perform buscar_pedido_aberto(v_item.pedido_id);
  if v_item.status = 'cancelado' then
    raise exception 'Item já cancelado' using errcode = 'P0001';
  end if;
  -- garçom só cancela item próprio que a cozinha ainda não começou
  if v_papel = 'garcom' and (v_item.criado_por <> auth.uid() or v_item.status <> 'pendente') then
    raise exception 'Peça ao gerente ou caixa para cancelar este item' using errcode = '42501';
  end if;

  update pedido_itens set
    status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), motivo_cancelamento = p_motivo
  where id = p_item
  returning * into v_item;

  perform registrar_auditoria('cancelar_item', 'pedido_itens', p_item,
    jsonb_build_object('pedido_id', v_item.pedido_id, 'produto', v_item.nome_produto,
                       'quantidade', v_item.quantidade, 'valor', v_item.subtotal, 'motivo', p_motivo));
  return v_item;
end $$;

-- Usado pelo Painel da Cozinha (KDS) e pelo garçom (marcar como entregue)
create or replace function atualizar_status_item(p_item uuid, p_status status_item) returns pedido_itens
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item pedido_itens;
begin
  perform exigir_papel('dono', 'gerente', 'caixa', 'garcom', 'cozinha');
  if p_status in ('cancelado', 'pendente') then
    raise exception 'Use cancelar_item para cancelar; não é possível voltar para pendente' using errcode = 'P0001';
  end if;

  update pedido_itens set
    status = p_status,
    preparo_iniciado_em = case when p_status = 'preparando' then coalesce(preparo_iniciado_em, now()) else preparo_iniciado_em end,
    pronto_em           = case when p_status = 'pronto'     then coalesce(pronto_em, now())           else pronto_em end,
    entregue_em         = case when p_status = 'entregue'   then coalesce(entregue_em, now())         else entregue_em end
  where id = p_item and status <> 'cancelado'
  returning * into v_item;

  if not found then
    raise exception 'Item não encontrado ou cancelado' using errcode = 'P0002';
  end if;
  return v_item;
end $$;

create or replace function aplicar_desconto(p_pedido uuid, p_valor numeric, p_motivo text default null)
returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_papel  papel_usuario;
  v_pedido pedidos;
  v_max    numeric;
begin
  v_papel := exigir_papel('dono', 'gerente', 'caixa');
  v_pedido := buscar_pedido_aberto(p_pedido);
  if p_valor < 0 or p_valor > v_pedido.subtotal then
    raise exception 'Desconto inválido' using errcode = 'P0001';
  end if;

  select round(v_pedido.subtotal * desconto_maximo_percentual / 100, 2) into v_max from configuracoes where id = 1;
  if v_papel = 'caixa' and p_valor > coalesce(v_max, 0) then
    raise exception 'Desconto acima do limite de R$ %. Peça ao gerente.', v_max using errcode = '42501';
  end if;

  update pedidos set desconto = p_valor where id = p_pedido;
  perform recalcular_pedido(p_pedido);

  if p_valor > 0 then
    perform registrar_auditoria('desconto', 'pedidos', p_pedido,
      jsonb_build_object('valor', p_valor, 'motivo', p_motivo, 'subtotal', v_pedido.subtotal));
  end if;
  select * into v_pedido from pedidos where id = p_pedido;
  if v_pedido.total < v_pedido.total_pago then
    raise exception 'O desconto deixaria o total abaixo do que já foi pago' using errcode = 'P0001';
  end if;
  return v_pedido;
end $$;

create or replace function definir_taxas(p_pedido uuid, p_cobrar_servico boolean, p_taxa_entrega numeric default null)
returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido pedidos;
begin
  perform exigir_papel('dono', 'gerente', 'caixa', 'garcom');
  perform buscar_pedido_aberto(p_pedido);
  update pedidos set
    cobrar_servico = coalesce(p_cobrar_servico, cobrar_servico),
    taxa_entrega   = coalesce(p_taxa_entrega, taxa_entrega)
  where id = p_pedido;
  perform recalcular_pedido(p_pedido);
  select * into v_pedido from pedidos where id = p_pedido;
  if v_pedido.total < v_pedido.total_pago then
    raise exception 'A alteração deixaria o total abaixo do que já foi pago' using errcode = 'P0001';
  end if;
  return v_pedido;
end $$;

create or replace function transferir_mesa(p_pedido uuid, p_mesa_destino uuid) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido pedidos;
begin
  perform exigir_papel('dono', 'gerente', 'caixa', 'garcom');
  v_pedido := buscar_pedido_aberto(p_pedido);
  if v_pedido.tipo <> 'mesa' then
    raise exception 'Só pedidos de mesa podem ser transferidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from pedidos where mesa_id = p_mesa_destino and status = 'aberto') then
    raise exception 'A mesa de destino já está ocupada' using errcode = 'P0001';
  end if;
  update pedidos set mesa_id = p_mesa_destino where id = p_pedido returning * into v_pedido;
  return v_pedido;
end $$;

-- -----------------------------------------------------------------------------
-- Pagamentos
-- -----------------------------------------------------------------------------
create or replace function saldo_fiado(p_cliente uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(valor), 0) from fiado_lancamentos where cliente_id = p_cliente
$$;

-- Registra um pagamento (pode ser parcial: conta dividida, duas formas etc.).
-- Quando o total pago atinge o total, a comanda é fechada automaticamente.
create or replace function registrar_pagamento(
  p_pedido          uuid,
  p_forma           uuid,
  p_valor           numeric,
  p_valor_recebido  numeric default null,
  p_cliente_id      uuid    default null    -- obrigatório se for fiado e o pedido não tiver cliente
) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caixa   uuid;
  v_pedido  pedidos;
  v_forma   formas_pagamento;
  v_cliente uuid;
  v_limite  numeric;
  v_pgto    pagamentos;
begin
  perform exigir_papel('dono', 'gerente', 'caixa');
  v_caixa  := exigir_caixa_aberto();
  v_pedido := buscar_pedido_aberto(p_pedido);

  select * into v_forma from formas_pagamento where id = p_forma and ativa;
  if not found then
    raise exception 'Forma de pagamento inválida' using errcode = 'P0001';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor inválido' using errcode = 'P0001';
  end if;
  if p_valor > v_pedido.total - v_pedido.total_pago then
    raise exception 'Valor maior que o restante da conta (R$ %)', v_pedido.total - v_pedido.total_pago
      using errcode = 'P0001';
  end if;
  if p_valor_recebido is not null and v_forma.tipo <> 'dinheiro' then
    raise exception 'Troco só existe para pagamento em dinheiro' using errcode = 'P0001';
  end if;

  if v_forma.tipo = 'fiado' then
    v_cliente := coalesce(p_cliente_id, v_pedido.cliente_id);
    if v_cliente is null then
      raise exception 'Informe o cliente para lançar no fiado' using errcode = 'P0001';
    end if;
    select limite_fiado into v_limite from clientes where id = v_cliente and ativo;
    if not found then
      raise exception 'Cliente não encontrado ou inativo' using errcode = 'P0001';
    end if;
    if v_limite is not null and saldo_fiado(v_cliente) + p_valor > v_limite then
      raise exception 'Limite de fiado do cliente excedido (limite R$ %, saldo atual R$ %)',
        v_limite, saldo_fiado(v_cliente) using errcode = 'P0001';
    end if;
    if v_pedido.cliente_id is null then
      update pedidos set cliente_id = v_cliente where id = p_pedido;
    end if;
  end if;

  insert into pagamentos (pedido_id, forma_pagamento_id, valor, valor_recebido, caixa_id, usuario_id)
  values (p_pedido, p_forma, p_valor, p_valor_recebido, v_caixa, auth.uid())
  returning * into v_pgto;

  if v_forma.tipo = 'fiado' then
    insert into fiado_lancamentos (cliente_id, tipo, valor, pedido_id, pagamento_id, caixa_id, descricao, usuario_id)
    values (v_cliente, 'debito', p_valor, p_pedido, v_pgto.id, v_caixa,
            'Pedido nº ' || v_pedido.numero, auth.uid());
  end if;

  select * into v_pedido from pedidos where id = p_pedido;   -- já recalculado pelo trigger
  if v_pedido.total_pago >= v_pedido.total then
    update pedidos set status = 'fechado', fechado_em = now(), caixa_id = v_caixa
    where id = p_pedido returning * into v_pedido;
    -- itens sem preparo pendente ficam como entregues
    update pedido_itens set status = 'entregue', entregue_em = coalesce(entregue_em, now())
    where pedido_id = p_pedido and status in ('pronto');
  end if;
  return v_pedido;
end $$;

create or replace function estornar_pagamento(p_pagamento uuid, p_motivo text) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pgto   pagamentos;
  v_pedido pedidos;
  v_lanc   fiado_lancamentos;
begin
  perform exigir_papel('dono', 'gerente');
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno' using errcode = 'P0001';
  end if;

  select * into v_pgto from pagamentos where id = p_pagamento for update;
  if not found or v_pgto.estornado then
    raise exception 'Pagamento não encontrado ou já estornado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from caixas where id = v_pgto.caixa_id and status = 'aberto') then
    raise exception 'Só é possível estornar pagamentos do caixa que está aberto' using errcode = 'P0001';
  end if;

  select * into v_pedido from pedidos where id = v_pgto.pedido_id for update;
  if v_pedido.status = 'fechado' then
    if v_pedido.mesa_id is not null and exists (
         select 1 from pedidos where mesa_id = v_pedido.mesa_id and status = 'aberto' and id <> v_pedido.id) then
      raise exception 'A mesa já foi reocupada; transfira a outra comanda antes de estornar' using errcode = 'P0001';
    end if;
    update pedidos set status = 'aberto', fechado_em = null, caixa_id = null where id = v_pedido.id;
  end if;

  update pagamentos set estornado = true where id = p_pagamento;

  select * into v_lanc from fiado_lancamentos where pagamento_id = p_pagamento and tipo = 'debito';
  if found then
    insert into fiado_lancamentos (cliente_id, tipo, valor, pedido_id, pagamento_id, caixa_id, descricao, usuario_id)
    values (v_lanc.cliente_id, 'ajuste', -v_lanc.valor, v_lanc.pedido_id, p_pagamento, v_pgto.caixa_id,
            'Estorno: ' || p_motivo, auth.uid());
  end if;

  perform registrar_auditoria('estornar_pagamento', 'pagamentos', p_pagamento,
    jsonb_build_object('pedido_id', v_pgto.pedido_id, 'valor', v_pgto.valor, 'motivo', p_motivo));

  select * into v_pedido from pedidos where id = v_pgto.pedido_id;
  return v_pedido;
end $$;

create or replace function cancelar_pedido(p_pedido uuid, p_motivo text) returns pedidos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido pedidos;
begin
  perform exigir_papel('dono', 'gerente');
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento' using errcode = 'P0001';
  end if;
  v_pedido := buscar_pedido_aberto(p_pedido);
  if v_pedido.total_pago > 0 then
    raise exception 'Estorne os pagamentos antes de cancelar o pedido' using errcode = 'P0001';
  end if;

  update pedido_itens set status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(),
                          motivo_cancelamento = 'Pedido cancelado: ' || p_motivo
  where pedido_id = p_pedido and status <> 'cancelado';

  update pedidos set status = 'cancelado', cancelado_por = auth.uid(), motivo_cancelamento = p_motivo,
                     fechado_em = now()
  where id = p_pedido returning * into v_pedido;

  perform registrar_auditoria('cancelar_pedido', 'pedidos', p_pedido,
    jsonb_build_object('numero', v_pedido.numero, 'subtotal', v_pedido.subtotal, 'motivo', p_motivo));
  return v_pedido;
end $$;

-- -----------------------------------------------------------------------------
-- Fiado: cliente quitando a conta
-- -----------------------------------------------------------------------------
create or replace function receber_fiado(p_cliente uuid, p_valor numeric, p_forma uuid, p_descricao text default null)
returns fiado_lancamentos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_forma  formas_pagamento;
  v_saldo  numeric;
  v_lanc   fiado_lancamentos;
begin
  perform exigir_papel('dono', 'gerente', 'caixa');
  select * into v_forma from formas_pagamento where id = p_forma and ativa;
  if not found or v_forma.tipo = 'fiado' then
    raise exception 'Forma de pagamento inválida para quitar fiado' using errcode = 'P0001';
  end if;
  v_saldo := saldo_fiado(p_cliente);
  if p_valor is null or p_valor <= 0 or p_valor > v_saldo then
    raise exception 'Valor inválido. Saldo devedor do cliente: R$ %', v_saldo using errcode = 'P0001';
  end if;

  insert into fiado_lancamentos (cliente_id, tipo, valor, forma_pagamento_id, caixa_id, descricao, usuario_id)
  values (p_cliente, 'pagamento', -p_valor, p_forma, exigir_caixa_aberto(),
          coalesce(p_descricao, 'Pagamento de fiado'), auth.uid())
  returning * into v_lanc;
  return v_lanc;
end $$;

-- -----------------------------------------------------------------------------
-- Despesas: marcar como paga
-- -----------------------------------------------------------------------------
create or replace function pagar_despesa(
  p_despesa     uuid,
  p_forma       uuid,
  p_valor_pago  numeric default null,     -- null = valor da despesa
  p_do_caixa    boolean default false     -- true = dinheiro saiu da gaveta do caixa aberto
) returns despesas
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_desp  despesas;
  v_forma formas_pagamento;
begin
  if p_do_caixa then
    perform exigir_papel('dono', 'gerente', 'caixa');
  else
    perform exigir_papel('dono', 'gerente');
  end if;

  select * into v_desp from despesas where id = p_despesa for update;
  if not found or v_desp.pago_em is not null then
    raise exception 'Despesa não encontrada ou já paga' using errcode = 'P0001';
  end if;
  select * into v_forma from formas_pagamento where id = p_forma and ativa;
  if not found or v_forma.tipo = 'fiado' then
    raise exception 'Forma de pagamento inválida' using errcode = 'P0001';
  end if;
  if p_do_caixa and v_forma.tipo <> 'dinheiro' then
    raise exception 'Só pagamentos em dinheiro saem da gaveta do caixa' using errcode = 'P0001';
  end if;

  update despesas set
    pago_em = now(),
    valor_pago = coalesce(p_valor_pago, valor),
    forma_pagamento_id = p_forma,
    caixa_id = case when p_do_caixa then exigir_caixa_aberto() end
  where id = p_despesa
  returning * into v_desp;
  return v_desp;
end $$;
