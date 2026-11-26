-- =============================================================================
-- Dados iniciais – Casa Vinte Grill
-- Baseado no que existe hoje no sistema antigo (MultSystem Web).
-- Ajuste preços e produtos no cadastro depois; aqui é só o ponto de partida.
-- =============================================================================

insert into configuracoes (id, nome_fantasia, razao_social, regime_tributario, cidade, uf,
                           fuso_horario, taxa_servico_percentual, desconto_maximo_percentual)
values (1, 'Casa Vinte Grill', 'Casa Vinte Grill', 'simples_nacional', 'Caxias', 'MA',
        'America/Fortaleza', 10, 10)
on conflict (id) do nothing;

-- Categorias do PDV atual
insert into categorias (nome, ordem, setor) values
  ('Executivo da Casa',  1, 'cozinha'),
  ('À la carte Casa',    2, 'cozinha'),
  ('Especial da Casa',   3, 'cozinha'),
  ('Grelhados Casa',     4, 'cozinha'),
  ('Grelhados Unidade',  5, 'cozinha'),
  ('Sobremesas',         6, 'cozinha'),
  ('Bebidas',            7, 'nenhum')   -- bebida não passa pela cozinha (mude para 'bar' se houver bar)
on conflict (nome) do nothing;

-- Produto confirmado no sistema antigo
insert into produtos (categoria_id, codigo, nome, preco, unidade)
select id, 'EXE01', 'Executivo da Casa', 26.50, 'UN' from categorias where nome = 'Executivo da Casa'
on conflict (codigo) do nothing;

-- Formas de pagamento: só as que fazem sentido (o sistema antigo tinha 16)
insert into formas_pagamento (nome, tipo, ordem) values
  ('Dinheiro',          'dinheiro',         1),
  ('Pix',               'pix',              2),
  ('Cartão de Débito',  'debito',           3),
  ('Cartão de Crédito', 'credito',          4),
  ('Vale Refeição',     'vale_refeicao',    5),
  ('Vale Alimentação',  'vale_alimentacao', 6),
  ('Fiado',             'fiado',            7)
on conflict (nome) do nothing;

-- Mesas 1 a 15 (ajuste para a quantidade real)
insert into mesas (numero)
select n from generate_series(1, 15) n
on conflict (numero) do nothing;

-- Categorias de despesa
insert into categorias_despesa (nome) values
  ('Insumos / Fornecedores'), ('Bebidas'), ('Gás'), ('Aluguel'), ('Energia'), ('Água'),
  ('Internet / Telefone'), ('Salários'), ('Impostos'), ('Manutenção'), ('Embalagens'), ('Outros')
on conflict (nome) do nothing;
