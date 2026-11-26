// Tipos das tabelas e views do banco (supabase/migrations).

export type Papel = "dono" | "gerente" | "caixa" | "garcom" | "cozinha";
export type Setor = "cozinha" | "bar" | "nenhum";
export type TipoPedido = "mesa" | "balcao" | "delivery" | "ifood" | "99food";
export type StatusPedido = "aberto" | "fechado" | "cancelado";
export type StatusItem = "pendente" | "preparando" | "pronto" | "entregue" | "cancelado";
export type TipoForma =
  | "dinheiro" | "pix" | "debito" | "credito" | "vale_refeicao" | "vale_alimentacao" | "fiado" | "outro";

export interface Perfil { id: string; nome: string; papel: Papel; ativo: boolean; created_at: string }

export interface Configuracoes {
  id: number; nome_fantasia: string; razao_social: string | null; cnpj: string | null;
  telefone: string | null; cidade: string | null; uf: string | null;
  fuso_horario: string; taxa_servico_percentual: number; desconto_maximo_percentual: number;
}

export interface Categoria { id: string; nome: string; ordem: number; setor: Setor; ativa: boolean }

export interface Produto {
  id: string; categoria_id: string; codigo: string | null; nome: string; descricao: string | null;
  preco: number; custo: number | null; unidade: "UN" | "KG"; setor: Setor | null;
  imagem_url: string | null; ativo: boolean; disponivel: boolean; ordem: number;
}

export interface Adicional { id: string; nome: string; preco: number; ativo: boolean }
export interface ProdutoAdicional { produto_id: string; adicional_id: string }

export interface Mesa { id: string; numero: number; descricao: string | null; lugares: number | null; ativa: boolean }

export interface Cliente {
  id: string; nome: string; telefone: string | null; documento: string | null; endereco: string | null;
  observacoes: string | null; limite_fiado: number | null; ativo: boolean;
}

export interface FormaPagamento { id: string; nome: string; tipo: TipoForma; ativa: boolean; ordem: number }

export interface Pedido {
  id: string; numero: number; tipo: TipoPedido; status: StatusPedido; mesa_id: string | null;
  cliente_id: string | null; nome_cliente: string | null; pessoas: number | null; garcom_id: string | null;
  aberto_em: string; fechado_em: string | null; observacoes: string | null;
  subtotal: number; desconto: number; cobrar_servico: boolean; taxa_servico: number; taxa_entrega: number;
  total: number; total_pago: number;
}

export interface PedidoItem {
  id: string; pedido_id: string; produto_id: string; nome_produto: string; preco_unitario: number;
  valor_adicionais: number; quantidade: number; subtotal: number; observacao: string | null;
  setor: Setor; status: StatusItem; created_at: string; criado_por: string;
  motivo_cancelamento: string | null;
  pedido_item_adicionais?: { nome: string; preco: number }[];
}

export interface Pagamento {
  id: string; pedido_id: string; forma_pagamento_id: string; valor: number; valor_recebido: number | null;
  troco: number; estornado: boolean; created_at: string;
}

export interface VwMesa {
  mesa_id: string; numero: number; descricao: string | null; lugares: number | null; pedido_id: string | null;
  pedido_numero: number | null; ocupada: boolean; pessoas: number | null; total: number | null;
  total_pago: number | null; aberto_em: string | null; minutos_aberta: number | null; garcom: string | null;
}

export interface VwPedidoAberto {
  id: string; numero: number; tipo: TipoPedido; mesa_numero: number | null; cliente: string | null;
  subtotal: number; desconto: number; taxa_servico: number; taxa_entrega: number; total: number;
  total_pago: number; restante: number; aberto_em: string; minutos_aberto: number; garcom: string | null;
  qtd_itens: number;
}

export interface VwKds {
  item_id: string; pedido_id: string; pedido_numero: number; pedido_tipo: TipoPedido; mesa_numero: number | null;
  cliente: string | null; setor: Setor; nome_produto: string; quantidade: number; observacao: string | null;
  adicionais: string | null; status: StatusItem; pedido_em: string; minutos_espera: number;
}

export interface VwPainelHoje {
  dia: string; vendas_hoje: number; pedidos_hoje: number; ticket_medio_hoje: number; comandas_abertas: number;
  valor_em_aberto: number; comandas_esquecidas: number; fiado_a_receber: number;
  contas_proximos_7_dias: number; caixa: "aberto" | null;
}

export interface VwVendasDiarias {
  dia: string; pedidos: number; subtotal: number; descontos: number; taxa_servico: number; taxa_entrega: number;
  faturamento: number; ticket_medio: number; pedidos_mesa: number; pedidos_balcao: number;
  pedidos_delivery: number; pedidos_apps: number;
}

export interface VwVendasPorForma { dia: string; forma_pagamento_id: string; forma: string; tipo: TipoForma; quantidade: number; total: number }

export interface VwProdutosVendidos {
  dia: string; produto_id: string; produto: string; categoria: string; quantidade: number;
  faturamento: number; custo_estimado: number | null;
}

export interface VwResumoCaixa {
  caixa_id: string; status: "aberto" | "fechado"; aberto_em: string; fechado_em: string | null;
  aberto_por: string; fechado_por: string | null; valor_abertura: number; total_vendas: number;
  vendas_por_forma: Record<string, number>; fiado_recebido: number; suprimentos: number; sangrias: number;
  despesas_pagas_no_caixa: number; dinheiro_esperado: number; dinheiro_informado: number | null;
  diferenca: number | null;
}

export interface VwFiadoSaldo {
  cliente_id: string; nome: string; telefone: string | null; limite_fiado: number | null; saldo: number;
  ultimo_lancamento: string; ultimo_pagamento: string | null;
}

export interface VwContaPagar {
  id: string; descricao: string; categoria: string | null; fornecedor: string | null; valor: number;
  vencimento: string; situacao: "vencida" | "vence_hoje" | "proximos_7_dias" | "a_vencer";
}

export interface CategoriaDespesa { id: string; nome: string; ativa: boolean }
export interface Fornecedor { id: string; nome: string; telefone: string | null; ativo: boolean }
