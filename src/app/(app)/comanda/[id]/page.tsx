"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Printer, Percent, X, Check, ArrowRightLeft, Ban, Truck, MoreVertical, Clock, Users, ChefHat,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados, useTempoReal, useAgora } from "@/lib/hooks";
import { brl, erroMsg, minutosDesde, NOME_STATUS_ITEM, NOME_TIPO, parseValor, qtd, tempo, dataHora } from "@/lib/format";
import { usePode } from "@/lib/sessao";
import type { Adicional, Categoria, Configuracoes, Mesa, Pedido, PedidoItem, Produto, ProdutoAdicional, StatusItem } from "@/lib/types";
import { Abas, Botao, Campo, Carregando, Cartao, Entrada, Etiqueta, Modal, Selecao, Vazio, cx, useAviso } from "@/components/ui";
import { Cardapio, type DadosCardapio, type NovoItem } from "@/components/comanda/cardapio";
import { PagamentoModal, QuitadoModal } from "@/components/comanda/pagamento";

type PedidoCompleto = Pedido & { mesas: { numero: number } | null; clientes: { nome: string } | null };

const TOM_STATUS: Record<StatusItem, "neutro" | "amarelo" | "verde" | "azul" | "vermelho"> = {
  pendente: "neutro", preparando: "amarelo", pronto: "verde", entregue: "azul", cancelado: "vermelho",
};

export default function ComandaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const avisar = useAviso();
  const agora = useAgora();
  const podeReceber = usePode("dono", "gerente", "caixa");
  const podeGerenciar = usePode("dono", "gerente");

  const pedidoQ = useDados(async () => {
    const sb = supabase();
    const [pedido, itens] = await Promise.all([
      q<PedidoCompleto>(sb.from("pedidos").select("*, mesas(numero), clientes(nome)").eq("id", id).single()),
      q<PedidoItem[]>(sb.from("pedido_itens").select("*, pedido_item_adicionais(nome,preco)").eq("pedido_id", id).order("created_at")),
    ]);
    return { pedido, itens };
  }, [id]);
  useTempoReal(["pedidos", "pedido_itens"], pedidoQ.recarregar);

  const cardapioQ = useDados<DadosCardapio & { config: Configuracoes | null }>(async () => {
    const sb = supabase();
    const [categorias, produtos, adicionais, vinculos, config] = await Promise.all([
      q<Categoria[]>(sb.from("categorias").select("*").eq("ativa", true).order("ordem").order("nome")),
      q<Produto[]>(sb.from("produtos").select("*").eq("ativo", true).order("ordem").order("nome")),
      q<Adicional[]>(sb.from("adicionais").select("*").eq("ativo", true)),
      q<ProdutoAdicional[]>(sb.from("produto_adicionais").select("*")),
      q<Configuracoes | null>(sb.from("configuracoes").select("*").maybeSingle()),
    ]);
    return { categorias, produtos, adicionais, vinculos, config };
  });

  const [aba, setAba] = useState<"cardapio" | "conta">("cardapio");
  const [pagando, setPagando] = useState(false);
  const [quitado, setQuitado] = useState<number | null>(null);
  const [acao, setAcao] = useState<null | "desconto" | "entrega" | "transferir" | "cancelar" | "menu">(null);
  const [cancelandoItem, setCancelandoItem] = useState<PedidoItem | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  if (pedidoQ.carregando || cardapioQ.carregando) return <Carregando />;
  if (pedidoQ.erro || !pedidoQ.dados) {
    return <Vazio titulo="Comanda não encontrada" texto={pedidoQ.erro ?? undefined}
      acao={<Botao onClick={() => router.push("/mesas")}>Voltar às mesas</Botao>} />;
  }

  const { pedido, itens } = pedidoQ.dados;
  const aberto = pedido.status === "aberto";
  const ativos = itens.filter((i) => i.status !== "cancelado");
  const cancelados = itens.filter((i) => i.status === "cancelado");
  const restante = Number(pedido.total) - Number(pedido.total_pago);
  const titulo = pedido.tipo === "mesa" ? `Mesa ${pedido.mesas?.numero}` : NOME_TIPO[pedido.tipo];
  const cliente = pedido.clientes?.nome ?? pedido.nome_cliente;
  const temEntrega = ["delivery", "ifood", "99food"].includes(pedido.tipo);

  async function adicionar(i: NovoItem) {
    setAdicionando(true);
    try {
      await rpc("adicionar_item", {
        p_pedido: id, p_produto: i.produto.id, p_quantidade: i.quantidade,
        p_adicionais: i.adicionais, p_observacao: i.observacao || null,
      });
      avisar(`+ ${qtd(i.quantidade, i.produto.unidade)} ${i.produto.nome}`);
      pedidoQ.recarregar();
    } catch (e) { avisar(erroMsg(e), "erro"); } finally { setAdicionando(false); }
  }

  async function mudarStatus(item: PedidoItem, status: StatusItem) {
    try { await rpc("atualizar_status_item", { p_item: item.id, p_status: status }); pedidoQ.recarregar(); }
    catch (e) { avisar(erroMsg(e), "erro"); }
  }

  async function alternarServico() {
    try { await rpc("definir_taxas", { p_pedido: id, p_cobrar_servico: !pedido.cobrar_servico }); pedidoQ.recarregar(); }
    catch (e) { avisar(erroMsg(e), "erro"); }
  }

  const pct = cardapioQ.dados?.config?.taxa_servico_percentual ?? 10;

  const conta = (
    <Cartao className="flex flex-col overflow-hidden">
      {/* Cabeçalho */}
      <div className="border-b border-stone-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{titulo} <span className="text-stone-400 tabular">#{pedido.numero}</span></h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
              {cliente && <span className="font-medium text-stone-700">{cliente}</span>}
              {pedido.pessoas && <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{pedido.pessoas}</span>}
              <span className="inline-flex items-center gap-1 tabular"><Clock className="size-3.5" />{tempo(minutosDesde(pedido.aberto_em, agora))}</span>
            </p>
            {pedido.observacoes && <p className="mt-1 text-sm text-stone-600">{pedido.observacoes}</p>}
          </div>
          {aberto ? (
            <button onClick={() => setAcao("menu")} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Mais opções">
              <MoreVertical className="size-5" />
            </button>
          ) : (
            <Etiqueta tom={pedido.status === "fechado" ? "verde" : "vermelho"}>{pedido.status === "fechado" ? "Fechado" : "Cancelado"}</Etiqueta>
          )}
        </div>
      </div>

      {/* Itens */}
      <div className="scroll-fino max-h-[50dvh] flex-1 divide-y divide-stone-100 overflow-y-auto lg:max-h-none">
        {ativos.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Nenhum item lançado ainda.</p>}
        {ativos.map((i) => (
          <div key={i.id} className="flex gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900">
                <span className="tabular text-stone-500">{qtd(Number(i.quantidade))}</span> {i.nome_produto}
              </p>
              {(i.pedido_item_adicionais?.length ?? 0) > 0 && (
                <p className="text-sm text-stone-500">+ {i.pedido_item_adicionais!.map((a) => a.nome).join(", ")}</p>
              )}
              {i.observacao && <p className="text-sm italic text-brasa-700">{i.observacao}</p>}
              <div className="mt-1 flex items-center gap-2">
                {i.setor !== "nenhum" && <Etiqueta tom={TOM_STATUS[i.status]}>{NOME_STATUS_ITEM[i.status]}</Etiqueta>}
                {aberto && i.status === "pronto" && (
                  <button onClick={() => mudarStatus(i, "entregue")} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Check className="size-3.5" /> Marcar entregue
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-semibold tabular">{brl(i.subtotal)}</span>
              {aberto && (
                <button onClick={() => setCancelandoItem(i)} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Cancelar item">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {cancelados.length > 0 && (
          <details className="px-4 py-2 text-sm text-stone-500">
            <summary className="cursor-pointer">{cancelados.length} item(ns) cancelado(s)</summary>
            {cancelados.map((i) => (
              <p key={i.id} className="py-1 line-through">{qtd(Number(i.quantidade))} {i.nome_produto} — {i.motivo_cancelamento}</p>
            ))}
          </details>
        )}
      </div>

      {/* Totais */}
      <div className="space-y-1.5 border-t border-stone-200 bg-stone-50 p-4 text-sm">
        <Linha rotulo="Subtotal" valor={pedido.subtotal} />
        {Number(pedido.desconto) > 0 && <Linha rotulo="Desconto" valor={-pedido.desconto} />}
        {pedido.tipo === "mesa" && (
          <div className="flex items-center justify-between">
            <button disabled={!aberto} onClick={alternarServico} className="inline-flex items-center gap-2 text-stone-600">
              <span className={cx("flex size-4 items-center justify-center rounded border", pedido.cobrar_servico ? "border-brasa-600 bg-brasa-600 text-white" : "border-stone-400")}>
                {pedido.cobrar_servico && <Check className="size-3" />}
              </span>
              Serviço ({pct}%)
            </button>
            <span className="tabular">{brl(pedido.taxa_servico)}</span>
          </div>
        )}
        {Number(pedido.taxa_entrega) > 0 && <Linha rotulo="Taxa de entrega" valor={pedido.taxa_entrega} />}
        <div className="flex items-center justify-between pt-1 text-lg font-bold">
          <span>Total</span><span className="tabular">{brl(pedido.total)}</span>
        </div>
        {Number(pedido.total_pago) > 0 && aberto && (
          <>
            <Linha rotulo="Já pago" valor={pedido.total_pago} />
            <div className="flex justify-between font-semibold text-brasa-700"><span>Falta</span><span className="tabular">{brl(restante)}</span></div>
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-2 border-t border-stone-200 p-3">
        <Botao variante="secundario" onClick={() => window.print()} aria-label="Imprimir conta"><Printer className="size-4" /></Botao>
        {aberto && podeReceber ? (
          <Botao className="flex-1" tamanho="lg" variante="sucesso" disabled={Number(pedido.total) <= 0} onClick={() => setPagando(true)}>
            Receber {brl(restante)}
          </Botao>
        ) : (
          <Botao className="flex-1" variante="secundario" onClick={() => router.push("/mesas")}>Voltar às mesas</Botao>
        )}
      </div>
    </Cartao>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <button onClick={() => router.push("/mesas")} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="size-4" /> Mesas
      </button>

      {aberto && (
        <div className="mb-3 lg:hidden">
          <Abas valor={aba} onChange={setAba} abas={[
            { id: "cardapio", rotulo: "Cardápio" },
            { id: "conta", rotulo: `Conta · ${ativos.length} itens · ${brl(pedido.total)}` },
          ]} />
        </div>
      )}

      <div className={cx("grid grid-cols-1 gap-5", aberto && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
        {aberto && (
          <div className={cx("min-w-0", aba !== "cardapio" && "hidden lg:block", adicionando && "pointer-events-none opacity-70")}>
            {cardapioQ.dados && <Cardapio dados={cardapioQ.dados} aoAdicionar={adicionar} />}
          </div>
        )}
        <div className={cx("min-w-0", aberto && aba !== "conta" && "hidden lg:block", "lg:sticky lg:top-20 lg:self-start")}>{conta}</div>
      </div>

      {/* Conta para impressora térmica */}
      <div className="area-impressao hidden print:block">
        <p style={{ textAlign: "center", fontWeight: 700 }}>{cardapioQ.dados?.config?.nome_fantasia ?? "Casa Vinte Grill"}</p>
        <p style={{ textAlign: "center" }}>{titulo} · Pedido #{pedido.numero}</p>
        <p style={{ textAlign: "center" }}>{dataHora(new Date().toISOString())}</p>
        <p>--------------------------------</p>
        {ativos.map((i) => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{qtd(Number(i.quantidade))} {i.nome_produto}</span><span>{brl(i.subtotal)}</span>
          </div>
        ))}
        <p>--------------------------------</p>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{brl(pedido.subtotal)}</span></div>
        {Number(pedido.desconto) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Desconto</span><span>-{brl(pedido.desconto)}</span></div>}
        {Number(pedido.taxa_servico) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Serviço</span><span>{brl(pedido.taxa_servico)}</span></div>}
        {Number(pedido.taxa_entrega) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Entrega</span><span>{brl(pedido.taxa_entrega)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>TOTAL</span><span>{brl(pedido.total)}</span></div>
        {pedido.pessoas && pedido.pessoas > 1 && <p>Por pessoa ({pedido.pessoas}): {brl(Number(pedido.total) / pedido.pessoas)}</p>}
        <p style={{ textAlign: "center", marginTop: 8 }}>Não é documento fiscal</p>
      </div>

      {/* Modais */}
      {pagando && (
        <PagamentoModal pedido={pedido} aoFechar={() => setPagando(false)} aoMudar={pedidoQ.recarregar}
          aoQuitar={(t) => { setPagando(false); setQuitado(t); }} />
      )}
      {quitado !== null && <QuitadoModal troco={quitado} aoFechar={() => router.push("/mesas")} />}

      {cancelandoItem && (
        <TextoModal titulo={`Cancelar ${cancelandoItem.nome_produto}?`} rotulo="Motivo" botao="Cancelar item" perigo
          opcoes={["Cliente desistiu", "Lançado errado", "Demorou demais", "Produto acabou"]}
          aoFechar={() => setCancelandoItem(null)}
          aoConfirmar={async (motivo) => {
            await rpc("cancelar_item", { p_item: cancelandoItem.id, p_motivo: motivo });
            avisar("Item cancelado"); setCancelandoItem(null); pedidoQ.recarregar();
          }} />
      )}

      {acao === "menu" && (
        <Modal aberto aoFechar={() => setAcao(null)} titulo="Opções da comanda" largura="sm">
          <div className="space-y-1">
            {podeReceber && <MenuItem icone={Percent} texto="Dar desconto" onClick={() => setAcao("desconto")} />}
            {temEntrega && <MenuItem icone={Truck} texto="Taxa de entrega" onClick={() => setAcao("entrega")} />}
            {pedido.tipo === "mesa" && <MenuItem icone={ArrowRightLeft} texto="Trocar de mesa" onClick={() => setAcao("transferir")} />}
            <MenuItem icone={ChefHat} texto="Ver painel da cozinha" onClick={() => router.push("/cozinha")} />
            {podeGerenciar && <MenuItem icone={Ban} texto="Cancelar comanda inteira" perigo onClick={() => setAcao("cancelar")} />}
          </div>
        </Modal>
      )}
      {acao === "desconto" && (
        <TextoModal titulo="Desconto" rotulo="Valor do desconto (R$)" botao="Aplicar desconto" numerico
          inicial={Number(pedido.desconto) ? String(pedido.desconto).replace(".", ",") : ""}
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (v) => {
            await rpc("aplicar_desconto", { p_pedido: id, p_valor: parseValor(v), p_motivo: null });
            avisar("Desconto aplicado"); setAcao(null); pedidoQ.recarregar();
          }} />
      )}
      {acao === "entrega" && (
        <TextoModal titulo="Taxa de entrega" rotulo="Valor (R$)" botao="Salvar" numerico
          inicial={Number(pedido.taxa_entrega) ? String(pedido.taxa_entrega).replace(".", ",") : ""}
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (v) => {
            await rpc("definir_taxas", { p_pedido: id, p_cobrar_servico: null, p_taxa_entrega: parseValor(v) });
            setAcao(null); pedidoQ.recarregar();
          }} />
      )}
      {acao === "transferir" && (
        <TransferirModal pedidoId={id} aoFechar={() => setAcao(null)} aoFeito={() => { avisar("Mesa trocada"); setAcao(null); pedidoQ.recarregar(); }} />
      )}
      {acao === "cancelar" && (
        <TextoModal titulo={`Cancelar a comanda #${pedido.numero}?`} rotulo="Motivo" botao="Cancelar comanda" perigo
          opcoes={["Cliente foi embora", "Comanda aberta por engano", "Pedido de teste"]}
          aoFechar={() => setAcao(null)}
          aoConfirmar={async (motivo) => {
            await rpc("cancelar_pedido", { p_pedido: id, p_motivo: motivo });
            avisar("Comanda cancelada"); router.push("/mesas");
          }} />
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return <div className="flex justify-between text-stone-600"><span>{rotulo}</span><span className="tabular">{brl(valor)}</span></div>;
}

function MenuItem({ icone: Icone, texto, onClick, perigo }: { icone: typeof Ban; texto: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium",
      perigo ? "text-red-600 hover:bg-red-50" : "hover:bg-stone-100")}>
      <Icone className="size-5" /> {texto}
    </button>
  );
}

/** Modal simples que pede um texto ou valor. */
export function TextoModal({ titulo, rotulo, botao, opcoes, inicial = "", numerico, perigo, aoFechar, aoConfirmar }: {
  titulo: string; rotulo: string; botao: string; opcoes?: string[]; inicial?: string; numerico?: boolean; perigo?: boolean;
  aoFechar: () => void; aoConfirmar: (v: string) => Promise<void>;
}) {
  const avisar = useAviso();
  const [v, setV] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const valido = numerico ? Number.isFinite(parseValor(v)) && parseValor(v) >= 0 && v.trim() !== "" : v.trim().length > 0;
  async function ok() {
    setEnviando(true);
    try { await aoConfirmar(v.trim()); } catch (e) { avisar(erroMsg(e), "erro"); setEnviando(false); }
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo={titulo} largura="sm"
      rodape={<><Botao variante="secundario" className="flex-1" onClick={aoFechar}>Voltar</Botao>
        <Botao variante={perigo ? "perigo" : "primario"} className="flex-1" disabled={!valido} carregando={enviando} onClick={ok}>{botao}</Botao></>}>
      {opcoes && (
        <div className="mb-3 flex flex-wrap gap-2">
          {opcoes.map((o) => (
            <button key={o} onClick={() => setV(o)}
              className={cx("rounded-full px-3 py-1.5 text-sm", v === o ? "bg-brasa-600 text-white" : "bg-stone-100 text-stone-700")}>{o}</button>
          ))}
        </div>
      )}
      <Campo rotulo={rotulo}>
        <Entrada autoFocus value={v} inputMode={numerico ? "decimal" : "text"} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valido && ok()} />
      </Campo>
    </Modal>
  );
}

function TransferirModal({ pedidoId, aoFechar, aoFeito }: { pedidoId: string; aoFechar: () => void; aoFeito: () => void }) {
  const avisar = useAviso();
  const [mesa, setMesa] = useState("");
  const { dados } = useDados(async () => {
    const sb = supabase();
    const [mesas, ocupadas] = await Promise.all([
      q<Mesa[]>(sb.from("mesas").select("*").eq("ativa", true).order("numero")),
      q<{ mesa_id: string }[]>(sb.from("pedidos").select("mesa_id").eq("status", "aberto").not("mesa_id", "is", null)),
    ]);
    const oc = new Set(ocupadas.map((o) => o.mesa_id));
    return mesas.filter((m) => !oc.has(m.id));
  });
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Trocar de mesa" largura="sm"
      rodape={<Botao className="w-full" disabled={!mesa} onClick={async () => {
        try { await rpc("transferir_mesa", { p_pedido: pedidoId, p_mesa_destino: mesa }); aoFeito(); }
        catch (e) { avisar(erroMsg(e), "erro"); }
      }}>Trocar</Botao>}>
      <Campo rotulo="Mesa livre de destino">
        <Selecao value={mesa} onChange={(e) => setMesa(e.target.value)}>
          <option value="">Escolha</option>
          {(dados ?? []).map((m) => <option key={m.id} value={m.id}>Mesa {m.numero}</option>)}
        </Selecao>
      </Campo>
    </Modal>
  );
}
