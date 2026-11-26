"use client";

import { useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados } from "@/lib/hooks";
import { brl, erroMsg, parseValor } from "@/lib/format";
import { usePode } from "@/lib/sessao";
import type { Cliente, FormaPagamento, Pagamento, Pedido } from "@/lib/types";
import { Botao, Campo, Entrada, Modal, Selecao, cx, useAviso } from "@/components/ui";

export function PagamentoModal({ pedido, aoFechar, aoMudar, aoQuitar }: {
  pedido: Pedido; aoFechar: () => void; aoMudar: () => void; aoQuitar: (troco: number) => void;
}) {
  const avisar = useAviso();
  const podeEstornar = usePode("dono", "gerente");
  const { dados, recarregar } = useDados(async () => {
    const sb = supabase();
    const [formas, pagamentos, clientes] = await Promise.all([
      q<FormaPagamento[]>(sb.from("formas_pagamento").select("*").eq("ativa", true).order("ordem")),
      q<Pagamento[]>(sb.from("pagamentos").select("*").eq("pedido_id", pedido.id).eq("estornado", false).order("created_at")),
      q<Cliente[]>(sb.from("clientes").select("id,nome,limite_fiado").eq("ativo", true).order("nome")),
    ]);
    return { formas, pagamentos, clientes };
  }, [pedido.id, pedido.total_pago]);

  const restante = Math.round((Number(pedido.total) - Number(pedido.total_pago)) * 100) / 100;
  const [formaId, setFormaId] = useState<string>("");
  const [valorTxt, setValorTxt] = useState("");
  const [recebidoTxt, setRecebidoTxt] = useState("");
  const [clienteId, setClienteId] = useState(pedido.cliente_id ?? "");
  const [enviando, setEnviando] = useState(false);

  const forma = dados?.formas.find((f) => f.id === formaId);
  const valor = valorTxt ? parseValor(valorTxt) : restante;
  const recebido = recebidoTxt ? parseValor(recebidoTxt) : NaN;
  const troco = forma?.tipo === "dinheiro" && Number.isFinite(recebido) ? Math.max(0, recebido - valor) : 0;
  const valido = forma && Number.isFinite(valor) && valor > 0 && valor <= restante + 0.001 &&
    (forma.tipo !== "dinheiro" || !recebidoTxt || recebido >= valor) &&
    (forma.tipo !== "fiado" || clienteId);

  const notas = [restante, ...[10, 20, 50, 100, 200].filter((n) => n > restante)].slice(0, 4);

  async function confirmar() {
    if (!forma) return;
    setEnviando(true);
    try {
      const p = await rpc<Pedido>("registrar_pagamento", {
        p_pedido: pedido.id,
        p_forma: forma.id,
        p_valor: valor,
        p_valor_recebido: forma.tipo === "dinheiro" && recebidoTxt ? recebido : null,
        p_cliente_id: forma.tipo === "fiado" ? clienteId : null,
      });
      if (p.status === "fechado") {
        aoQuitar(troco);
      } else {
        avisar(`${forma.nome}: ${brl(valor)} recebido${troco ? ` · troco ${brl(troco)}` : ""}`);
        setFormaId(""); setValorTxt(""); setRecebidoTxt("");
        aoMudar(); recarregar();
      }
    } catch (e) {
      avisar(erroMsg(e), "erro");
    } finally {
      setEnviando(false);
    }
  }

  async function estornar(pg: Pagamento) {
    const motivo = window.prompt("Motivo do estorno:");
    if (!motivo) return;
    try {
      await rpc("estornar_pagamento", { p_pagamento: pg.id, p_motivo: motivo });
      avisar("Pagamento estornado");
      aoMudar(); recarregar();
    } catch (e) { avisar(erroMsg(e), "erro"); }
  }

  const nomeForma = (id: string) => dados?.formas.find((f) => f.id === id)?.nome ?? "—";

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Receber · pedido #${pedido.numero}`} largura="md"
      rodape={<Botao className="w-full" tamanho="lg" disabled={!valido} carregando={enviando} onClick={confirmar}>
        {forma ? `Confirmar ${brl(Number.isFinite(valor) ? valor : 0)} em ${forma.nome}` : "Escolha a forma de pagamento"}
      </Botao>}>
      <div className="space-y-5">
        <div className="rounded-2xl bg-brasa-700 p-4 text-white">
          <p className="text-sm text-brasa-200">Falta receber</p>
          <p className="valor text-3xl font-bold">{brl(restante)}</p>
          {Number(pedido.total_pago) > 0 && (
            <p className="mt-1 text-sm text-brasa-200 tabular">Total {brl(pedido.total)} · já pago {brl(pedido.total_pago)}</p>
          )}
        </div>

        {(dados?.pagamentos.length ?? 0) > 0 && (
          <div className="space-y-1">
            {dados!.pagamentos.map((pg) => (
              <div key={pg.id} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <span>{nomeForma(pg.forma_pagamento_id)}</span>
                <span className="flex items-center gap-2 font-semibold tabular">
                  {brl(pg.valor)}
                  {podeEstornar && (
                    <button onClick={() => estornar(pg)} className="rounded p-1 text-stone-400 hover:text-red-600" aria-label="Estornar">
                      <Undo2 className="size-4" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(dados?.formas ?? []).map((f) => (
            <button key={f.id} onClick={() => setFormaId(f.id)}
              className={cx("h-14 rounded-xl border-2 px-2 text-sm font-semibold transition-colors",
                formaId === f.id ? "border-brasa-500 bg-brasa-50 text-brasa-700" : "border-stone-200 text-stone-700 hover:border-stone-300")}>
              {f.nome}
            </button>
          ))}
        </div>

        {forma && (
          <div className="space-y-4">
            <Campo rotulo="Valor deste pagamento" dica="Deixe como está para pagar tudo, ou digite um valor menor para dividir a conta.">
              <Entrada inputMode="decimal" value={valorTxt} placeholder={brl(restante)} onChange={(e) => setValorTxt(e.target.value)} />
            </Campo>
            {forma.tipo === "dinheiro" && (
              <div>
                <Campo rotulo="Cliente entregou">
                  <Entrada inputMode="decimal" value={recebidoTxt} onChange={(e) => setRecebidoTxt(e.target.value)} placeholder="Opcional, para calcular o troco" />
                </Campo>
                <div className="mt-2 flex flex-wrap gap-2">
                  {notas.map((n) => (
                    <button key={n} onClick={() => setRecebidoTxt(String(n).replace(".", ","))}
                      className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium tabular hover:bg-stone-200">{brl(n)}</button>
                  ))}
                </div>
                {troco > 0 && (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-lg font-bold text-emerald-800 tabular">Troco: {brl(troco)}</p>
                )}
              </div>
            )}
            {forma.tipo === "fiado" && (
              <Campo rotulo="Cliente do fiado">
                <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Escolha o cliente</option>
                  {(dados?.clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function QuitadoModal({ troco, aoFechar }: { troco: number; aoFechar: () => void }) {
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Conta fechada" largura="sm"
      rodape={<Botao className="w-full" tamanho="lg" onClick={aoFechar}>Voltar às mesas</Botao>}>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-16 text-emerald-600" />
        <p className="text-lg font-semibold">Pagamento concluído</p>
        {troco > 0 && <p className="rounded-xl bg-emerald-50 px-5 py-3 text-2xl font-bold text-emerald-800 tabular">Troco: {brl(troco)}</p>}
      </div>
    </Modal>
  );
}
