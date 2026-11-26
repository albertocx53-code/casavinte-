-- =============================================================================
-- Migration 3: segurança (Row Level Security + permissões)
--
-- Resumo de quem vê/faz o quê:
--   dono     -> tudo, inclusive usuários e configurações
--   gerente  -> tudo, menos usuários e configurações
--   caixa    -> pedidos, pagamentos, caixa, fiado, clientes
--   garcom   -> cardápio, mesas, abrir comanda, lançar itens (não vê caixa/financeiro)
--   cozinha  -> só o painel da cozinha (itens) e o cardápio
-- Gravações de pedidos, pagamentos e caixa NÃO são feitas direto nas tabelas:
-- só pelas funções da migration 2, que validam as regras.
-- =============================================================================

create or replace function sou_equipe() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select meu_papel() is not null
$$;

create or replace function tenho_papel(variadic p_papeis papel_usuario[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(meu_papel() = any (p_papeis), false)
$$;

-- Liga RLS em todas as tabelas
alter table configuracoes          enable row level security;
alter table perfis                 enable row level security;
alter table categorias             enable row level security;
alter table produtos               enable row level security;
alter table adicionais             enable row level security;
alter table produto_adicionais     enable row level security;
alter table mesas                  enable row level security;
alter table clientes               enable row level security;
alter table formas_pagamento       enable row level security;
alter table caixas                 enable row level security;
alter table movimentos_caixa       enable row level security;
alter table pedidos                enable row level security;
alter table pedido_itens           enable row level security;
alter table pedido_item_adicionais enable row level security;
alter table pagamentos             enable row level security;
alter table fiado_lancamentos      enable row level security;
alter table fornecedores           enable row level security;
alter table categorias_despesa     enable row level security;
alter table despesas               enable row level security;
alter table auditoria              enable row level security;

-- Configurações
create policy cfg_ler    on configuracoes for select to authenticated using (sou_equipe());
create policy cfg_editar on configuracoes for update to authenticated
  using (tenho_papel('dono')) with check (tenho_papel('dono'));

-- Perfis: todo mundo da equipe vê os nomes; cada um vê o próprio (mesmo inativo);
-- só o dono muda papel/ativação.
create policy perfis_ler    on perfis for select to authenticated using (id = auth.uid() or sou_equipe());
create policy perfis_editar on perfis for update to authenticated
  using (tenho_papel('dono')) with check (tenho_papel('dono'));

-- Cardápio, mesas, formas de pagamento: equipe lê, dono/gerente edita
do $$
declare t text;
begin
  foreach t in array array['categorias', 'produtos', 'adicionais', 'produto_adicionais', 'mesas', 'formas_pagamento']
  loop
    execute format('create policy %1$s_ler on %1$I for select to authenticated using (sou_equipe())', t);
    execute format('create policy %1$s_inserir on %1$I for insert to authenticated with check (tenho_papel(''dono'',''gerente''))', t);
    execute format('create policy %1$s_editar on %1$I for update to authenticated using (tenho_papel(''dono'',''gerente'')) with check (tenho_papel(''dono'',''gerente''))', t);
    execute format('create policy %1$s_excluir on %1$I for delete to authenticated using (tenho_papel(''dono'',''gerente''))', t);
  end loop;
end $$;

-- Clientes: equipe lê; caixa/gerente/dono cadastram; só dono/gerente excluem
create policy clientes_ler     on clientes for select to authenticated using (sou_equipe());
create policy clientes_inserir on clientes for insert to authenticated with check (tenho_papel('dono', 'gerente', 'caixa'));
create policy clientes_editar  on clientes for update to authenticated
  using (tenho_papel('dono', 'gerente', 'caixa')) with check (tenho_papel('dono', 'gerente', 'caixa'));
create policy clientes_excluir on clientes for delete to authenticated using (tenho_papel('dono', 'gerente'));

-- Pedidos e itens: equipe lê (garçom e cozinha precisam). Escrita só via funções.
create policy pedidos_ler        on pedidos                for select to authenticated using (sou_equipe());
create policy itens_ler          on pedido_itens           for select to authenticated using (sou_equipe());
create policy item_adicionais_ler on pedido_item_adicionais for select to authenticated using (sou_equipe());

-- Dinheiro: só quem mexe com caixa
create policy caixas_ler     on caixas            for select to authenticated using (tenho_papel('dono', 'gerente', 'caixa'));
create policy mov_caixa_ler  on movimentos_caixa  for select to authenticated using (tenho_papel('dono', 'gerente', 'caixa'));
create policy pagamentos_ler on pagamentos        for select to authenticated using (tenho_papel('dono', 'gerente', 'caixa'));
create policy fiado_ler      on fiado_lancamentos for select to authenticated using (tenho_papel('dono', 'gerente', 'caixa'));

-- Financeiro: dono e gerente
do $$
declare t text;
begin
  foreach t in array array['fornecedores', 'categorias_despesa', 'despesas']
  loop
    execute format('create policy %1$s_ler on %1$I for select to authenticated using (tenho_papel(''dono'',''gerente''))', t);
    execute format('create policy %1$s_inserir on %1$I for insert to authenticated with check (tenho_papel(''dono'',''gerente''))', t);
    execute format('create policy %1$s_editar on %1$I for update to authenticated using (tenho_papel(''dono'',''gerente'')) with check (tenho_papel(''dono'',''gerente''))', t);
    execute format('create policy %1$s_excluir on %1$I for delete to authenticated using (tenho_papel(''dono'',''gerente''))', t);
  end loop;
end $$;

-- Auditoria: só leitura, dono e gerente
create policy auditoria_ler on auditoria for select to authenticated using (tenho_papel('dono', 'gerente'));

-- -----------------------------------------------------------------------------
-- Permissões de tabela e de funções
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Despesa só é marcada como paga via pagar_despesa (impede "paga" na mão com caixa_id falso).
-- Por isso insert/update liberam apenas as colunas de cadastro.
revoke insert, update on despesas from authenticated;
grant insert (descricao, categoria_id, fornecedor_id, valor, vencimento, observacoes) on despesas to authenticated;
grant update (descricao, categoria_id, fornecedor_id, valor, vencimento, observacoes) on despesas to authenticated;

-- Tabelas/funções criadas no futuro também não ficam abertas para visitantes (anon)
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated;

-- Funções internas: ninguém chama direto
revoke execute on function handle_new_user()                         from authenticated;
revoke execute on function trg_recalcular_pedido()                   from authenticated;
revoke execute on function recalcular_pedido(uuid)                   from authenticated;
revoke execute on function buscar_pedido_aberto(uuid)                from authenticated;
revoke execute on function registrar_auditoria(text, text, uuid, jsonb) from authenticated;
revoke execute on function set_updated_at()                          from authenticated;

-- -----------------------------------------------------------------------------
-- Tempo real (Supabase Realtime): KDS e mapa de mesas atualizam sozinhos
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table pedidos, pedido_itens;
  end if;
end $$;
