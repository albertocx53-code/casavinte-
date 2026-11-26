-- =============================================================================
-- Casa Vinte Grill – Sistema novo
-- Migration 1: estrutura base (tipos, tabelas, índices, triggers utilitários)
-- Banco: PostgreSQL (Supabase)
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos (enums)
-- -----------------------------------------------------------------------------
create type papel_usuario     as enum ('dono', 'gerente', 'caixa', 'garcom', 'cozinha');
create type setor_preparo     as enum ('cozinha', 'bar', 'nenhum');
create type unidade_venda     as enum ('UN', 'KG');
create type tipo_pedido       as enum ('mesa', 'balcao', 'delivery', 'ifood', '99food');
create type status_pedido     as enum ('aberto', 'fechado', 'cancelado');
create type status_item       as enum ('pendente', 'preparando', 'pronto', 'entregue', 'cancelado');
create type status_caixa      as enum ('aberto', 'fechado');
create type tipo_mov_caixa    as enum ('sangria', 'suprimento');
create type tipo_forma_pgto   as enum ('dinheiro', 'pix', 'debito', 'credito',
                                       'vale_refeicao', 'vale_alimentacao', 'fiado', 'outro');
create type tipo_lanc_fiado   as enum ('debito', 'pagamento', 'ajuste');

-- -----------------------------------------------------------------------------
-- Utilitário: atualiza updated_at
-- -----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Configurações do restaurante (linha única)
-- -----------------------------------------------------------------------------
create table configuracoes (
  id                          smallint primary key default 1 check (id = 1),
  nome_fantasia               text not null,
  razao_social                text,
  cnpj                        text,
  inscricao_estadual          text,
  regime_tributario           text default 'simples_nacional',
  telefone                    text,
  email                       text,
  endereco                    text,
  numero                      text,
  bairro                      text,
  cidade                      text,
  uf                          char(2),
  cep                         text,
  logo_url                    text,
  fuso_horario                text not null default 'America/Fortaleza',
  taxa_servico_percentual     numeric(5,2) not null default 10 check (taxa_servico_percentual between 0 and 30),
  desconto_maximo_percentual  numeric(5,2) not null default 10 check (desconto_maximo_percentual between 0 and 100),
  updated_at                  timestamptz not null default now()
);
create trigger trg_configuracoes_updated before update on configuracoes
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Usuários do sistema (perfil ligado ao auth.users do Supabase)
-- -----------------------------------------------------------------------------
create table perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  papel       papel_usuario not null default 'garcom',
  ativo       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_perfis_updated before update on perfis
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Cardápio
-- -----------------------------------------------------------------------------
create table categorias (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ordem       int  not null default 0,
  setor       setor_preparo not null default 'cozinha',   -- para onde vão os pedidos (KDS)
  ativa       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_categorias_updated before update on categorias
  for each row execute function set_updated_at();

create table produtos (
  id            uuid primary key default gen_random_uuid(),
  categoria_id  uuid not null references categorias (id),
  codigo        text unique,                               -- código curto para busca no PDV
  nome          text not null,
  descricao     text,
  preco         numeric(10,2) not null check (preco >= 0),
  custo         numeric(10,2) check (custo >= 0),          -- para margem (opcional)
  unidade       unidade_venda not null default 'UN',
  setor         setor_preparo,                             -- null = usa o setor da categoria
  imagem_url    text,
  ativo         boolean not null default true,             -- aparece no cardápio
  disponivel    boolean not null default true,             -- false = esgotado hoje
  ordem         int not null default 0,
  -- campos fiscais (para NFC-e numa fase futura)
  ncm           text,
  cfop          text,
  cest          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_produtos_categoria on produtos (categoria_id) where ativo;
create index idx_produtos_nome on produtos (lower(nome));
create trigger trg_produtos_updated before update on produtos
  for each row execute function set_updated_at();

-- Adicionais / variações (ex.: "Ovo", "Bacon extra", "Ponto da carne: mal passado")
create table adicionais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  preco       numeric(10,2) not null default 0 check (preco >= 0),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table produto_adicionais (
  produto_id   uuid not null references produtos (id) on delete cascade,
  adicional_id uuid not null references adicionais (id) on delete cascade,
  primary key (produto_id, adicional_id)
);

-- -----------------------------------------------------------------------------
-- Mesas e clientes
-- -----------------------------------------------------------------------------
create table mesas (
  id          uuid primary key default gen_random_uuid(),
  numero      int not null unique check (numero > 0),
  descricao   text,
  lugares     int check (lugares > 0),
  ativa       boolean not null default true
);

create table clientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  telefone      text,
  documento     text,                                       -- CPF/CNPJ (opcional)
  endereco      text,
  observacoes   text,
  limite_fiado  numeric(10,2) check (limite_fiado >= 0),    -- null = sem limite
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_clientes_nome on clientes (lower(nome));
create index idx_clientes_telefone on clientes (telefone);
create trigger trg_clientes_updated before update on clientes
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Formas de pagamento
-- -----------------------------------------------------------------------------
create table formas_pagamento (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null unique,
  tipo    tipo_forma_pgto not null,
  ativa   boolean not null default true,
  ordem   int not null default 0
);

-- -----------------------------------------------------------------------------
-- Caixa (sessões de abertura/fechamento)
-- -----------------------------------------------------------------------------
create table caixas (
  id                   uuid primary key default gen_random_uuid(),
  status               status_caixa not null default 'aberto',
  aberto_por           uuid not null references perfis (id),
  aberto_em            timestamptz not null default now(),
  valor_abertura       numeric(10,2) not null default 0 check (valor_abertura >= 0),
  fechado_por          uuid references perfis (id),
  fechado_em           timestamptz,
  dinheiro_esperado    numeric(10,2),        -- calculado no fechamento
  dinheiro_informado   numeric(10,2),        -- contado pelo operador
  diferenca            numeric(10,2),        -- informado - esperado
  observacoes          text,
  check ((status = 'fechado') = (fechado_em is not null))
);
-- Só pode existir UM caixa aberto por vez
create unique index uq_um_caixa_aberto on caixas (status) where status = 'aberto';

create table movimentos_caixa (
  id          uuid primary key default gen_random_uuid(),
  caixa_id    uuid not null references caixas (id),
  tipo        tipo_mov_caixa not null,
  valor       numeric(10,2) not null check (valor > 0),
  motivo      text not null,
  usuario_id  uuid not null references perfis (id),
  created_at  timestamptz not null default now()
);
create index idx_mov_caixa on movimentos_caixa (caixa_id);

-- -----------------------------------------------------------------------------
-- Pedidos (comandas) e itens
-- -----------------------------------------------------------------------------
create table pedidos (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,  -- número exibido (ex.: 1247)
  tipo              tipo_pedido not null,
  status            status_pedido not null default 'aberto',
  mesa_id           uuid references mesas (id),
  cliente_id        uuid references clientes (id),
  nome_cliente      text,                    -- identificação rápida no balcão
  pessoas           int check (pessoas > 0),
  garcom_id         uuid references perfis (id),
  aberto_por        uuid not null references perfis (id),
  aberto_em         timestamptz not null default now(),
  fechado_em        timestamptz,
  caixa_id          uuid references caixas (id),   -- caixa em que foi fechado
  observacoes       text,
  -- valores (mantidos pelas funções de recálculo)
  subtotal          numeric(10,2) not null default 0,
  desconto          numeric(10,2) not null default 0 check (desconto >= 0),
  cobrar_servico    boolean not null default true,
  taxa_servico      numeric(10,2) not null default 0 check (taxa_servico >= 0),
  taxa_entrega      numeric(10,2) not null default 0 check (taxa_entrega >= 0),
  total             numeric(10,2) not null default 0 check (total >= 0),
  total_pago        numeric(10,2) not null default 0,
  -- cancelamento
  cancelado_por     uuid references perfis (id),
  motivo_cancelamento text,
  codigo_externo    text,                    -- id do pedido no iFood/99food
  updated_at        timestamptz not null default now(),
  check (tipo <> 'mesa' or mesa_id is not null),
  check (status <> 'cancelado' or motivo_cancelamento is not null)
);
-- Uma mesa só pode ter UMA comanda aberta
create unique index uq_mesa_um_pedido_aberto on pedidos (mesa_id) where status = 'aberto' and mesa_id is not null;
create index idx_pedidos_status on pedidos (status);
create index idx_pedidos_fechado_em on pedidos (fechado_em) where status = 'fechado';
create index idx_pedidos_cliente on pedidos (cliente_id);
create trigger trg_pedidos_updated before update on pedidos
  for each row execute function set_updated_at();

create table pedido_itens (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references pedidos (id) on delete cascade,
  produto_id         uuid not null references produtos (id),
  -- "fotografia" do produto no momento da venda (preço pode mudar depois)
  nome_produto       text not null,
  preco_unitario     numeric(10,2) not null check (preco_unitario >= 0),
  valor_adicionais   numeric(10,2) not null default 0 check (valor_adicionais >= 0),
  quantidade         numeric(10,3) not null check (quantidade > 0),
  subtotal           numeric(10,2) generated always as
                       (round(quantidade * (preco_unitario + valor_adicionais), 2)) stored,
  observacao         text,                   -- "sem cebola", "ao ponto"
  setor              setor_preparo not null,
  status             status_item not null default 'pendente',
  criado_por         uuid not null references perfis (id),
  created_at         timestamptz not null default now(),
  preparo_iniciado_em timestamptz,
  pronto_em          timestamptz,
  entregue_em        timestamptz,
  cancelado_por      uuid references perfis (id),
  cancelado_em       timestamptz,
  motivo_cancelamento text,
  check (status <> 'cancelado' or motivo_cancelamento is not null)
);
create index idx_itens_pedido on pedido_itens (pedido_id);
create index idx_itens_kds on pedido_itens (setor, status) where status in ('pendente', 'preparando', 'pronto');
create index idx_itens_produto on pedido_itens (produto_id);

create table pedido_item_adicionais (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references pedido_itens (id) on delete cascade,
  adicional_id  uuid references adicionais (id),
  nome          text not null,
  preco         numeric(10,2) not null default 0
);
create index idx_item_adicionais on pedido_item_adicionais (item_id);

-- -----------------------------------------------------------------------------
-- Pagamentos de pedidos
-- -----------------------------------------------------------------------------
create table pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  pedido_id           uuid not null references pedidos (id),
  forma_pagamento_id  uuid not null references formas_pagamento (id),
  valor               numeric(10,2) not null check (valor > 0),   -- valor abatido da conta
  valor_recebido      numeric(10,2),                               -- dinheiro entregue pelo cliente
  troco               numeric(10,2) generated always as
                        (case when valor_recebido is null then 0 else greatest(valor_recebido - valor, 0) end) stored,
  caixa_id            uuid not null references caixas (id),
  usuario_id          uuid not null references perfis (id),
  created_at          timestamptz not null default now(),
  estornado           boolean not null default false,
  check (valor_recebido is null or valor_recebido >= valor)
);
create index idx_pagamentos_pedido on pagamentos (pedido_id);
create index idx_pagamentos_caixa on pagamentos (caixa_id);

-- -----------------------------------------------------------------------------
-- Fiado (conta corrente de clientes)
-- -----------------------------------------------------------------------------
create table fiado_lancamentos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references clientes (id),
  tipo                tipo_lanc_fiado not null,
  valor               numeric(10,2) not null check (valor <> 0),  -- debito > 0 aumenta a dívida; pagamento < 0
  pedido_id           uuid references pedidos (id),
  pagamento_id        uuid references pagamentos (id),
  forma_pagamento_id  uuid references formas_pagamento (id),      -- como o cliente quitou
  caixa_id            uuid references caixas (id),
  descricao           text,
  usuario_id          uuid not null references perfis (id),
  created_at          timestamptz not null default now(),
  check (tipo <> 'debito'    or valor > 0),
  check (tipo <> 'pagamento' or valor < 0)
);
create index idx_fiado_cliente on fiado_lancamentos (cliente_id);

-- -----------------------------------------------------------------------------
-- Financeiro simples: fornecedores e despesas (contas a pagar)
-- -----------------------------------------------------------------------------
create table fornecedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text,
  documento   text,
  observacoes text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table categorias_despesa (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ativa boolean not null default true
);

create table despesas (
  id                    uuid primary key default gen_random_uuid(),
  descricao             text not null,
  categoria_id          uuid references categorias_despesa (id),
  fornecedor_id         uuid references fornecedores (id),
  valor                 numeric(10,2) not null check (valor > 0),
  vencimento            date not null,
  pago_em               timestamptz,
  valor_pago            numeric(10,2) check (valor_pago > 0),
  forma_pagamento_id    uuid references formas_pagamento (id),
  caixa_id              uuid references caixas (id),     -- preenchido se saiu dinheiro do caixa
  observacoes           text,
  criado_por            uuid not null default auth.uid() references perfis (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((pago_em is null) = (valor_pago is null))
);
create index idx_despesas_vencimento on despesas (vencimento) where pago_em is null;
create trigger trg_despesas_updated before update on despesas
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria (cancelamentos, descontos, estornos, diferenças de caixa)
-- -----------------------------------------------------------------------------
create table auditoria (
  id           bigint generated always as identity primary key,
  usuario_id   uuid references perfis (id),
  acao         text not null,
  tabela       text not null,
  registro_id  uuid,
  dados        jsonb,
  created_at   timestamptz not null default now()
);
create index idx_auditoria_data on auditoria (created_at desc);
