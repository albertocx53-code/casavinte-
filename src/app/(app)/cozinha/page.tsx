"use client";

import { useEffect, useRef, useState } from "react";
import { ChefHat, Volume2, VolumeX, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useAgora, useDados, useTempoReal } from "@/lib/hooks";
import { erroMsg, minutosDesde, NOME_TIPO, qtd, tempo } from "@/lib/format";
import type { Setor, StatusItem, VwKds } from "@/lib/types";
import { Botao, Carregando, Pilulas, Titulo, Vazio, cx, useAviso } from "@/components/ui";

type Coluna = { status: StatusItem; titulo: string; proximo: StatusItem; acao: string; cor: string };
const COLUNAS: Coluna[] = [
  { status: "pendente", titulo: "Na fila", proximo: "preparando", acao: "Começar", cor: "border-t-stone-400" },
  { status: "preparando", titulo: "Preparando", proximo: "pronto", acao: "Pronto", cor: "border-t-mostarda-500" },
  { status: "pronto", titulo: "Pronto p/ servir", proximo: "entregue", acao: "Entregue", cor: "border-t-emerald-600" },
];

function bip() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { /* navegador sem áudio */ }
}

export default function CozinhaPage() {
  const avisar = useAviso();
  const agora = useAgora(15_000);
  const [setor, setSetor] = useState<"todos" | Setor>("todos");
  const [som, setSom] = useState(true);
  const { dados, carregando, erro, recarregar } = useDados(() =>
    q<VwKds[]>(supabase().from("vw_kds").select("*").order("pedido_em")));
  useTempoReal(["pedido_itens"], recarregar);

  // bip quando chega item novo na fila
  const qtdFila = (dados ?? []).filter((i) => i.status === "pendente").length;
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    if (anterior.current !== null && qtdFila > anterior.current && som) bip();
    anterior.current = qtdFila;
  }, [qtdFila, som]);

  if (carregando) return <Carregando />;
  if (erro) return <Vazio titulo="Não foi possível carregar" texto={erro} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const itens = (dados ?? []).filter((i) => setor === "todos" || i.setor === setor);
  const temBar = (dados ?? []).some((i) => i.setor === "bar");

  async function avancar(ids: string[], status: StatusItem) {
    try {
      await Promise.all(ids.map((id) => rpc("atualizar_status_item", { p_item: id, p_status: status })));
      recarregar();
    } catch (e) { avisar(erroMsg(e), "erro"); }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Operação & Salão · Cozinha" sub="Toque num item para avançar. A tela atualiza sozinha."
        acoes={<Botao variante="suave" onClick={() => setSom(!som)}>
          {som ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Som {som ? "ligado" : "desligado"}
        </Botao>}>
        Painel KDS
      </Titulo>

      {temBar && (
        <div className="mb-4">
          <Pilulas valor={setor} onChange={setSetor} opcoes={[
            { id: "todos", rotulo: "Todos", qtd: dados?.length },
            { id: "cozinha", rotulo: "Cozinha", qtd: dados?.filter((i) => i.setor === "cozinha").length },
            { id: "bar", rotulo: "Bar", qtd: dados?.filter((i) => i.setor === "bar").length },
          ]} />
        </div>
      )}

      {itens.length === 0 ? (
        <Vazio icone={<ChefHat className="size-10" />} titulo="Nenhum pedido na cozinha" texto="Quando o garçom lançar um prato, ele aparece aqui na hora." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUNAS.map((col) => {
            const daColuna = itens.filter((i) => i.status === col.status);
            // agrupa por pedido (um "ticket" por comanda)
            const tickets = Object.values(daColuna.reduce<Record<string, VwKds[]>>((acc, i) => {
              (acc[i.pedido_id] ??= []).push(i); return acc;
            }, {}));
            return (
              <section key={col.status} className="flex flex-col gap-3">
                <h2 className="flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-stone-600">
                  {col.titulo} <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-700 ring-1 ring-stone-200 tabular">{daColuna.length}</span>
                </h2>
                {tickets.map((t) => {
                  const p = t[0];
                  const min = Math.max(...t.map((i) => minutosDesde(i.pedido_em, agora)));
                  const atraso = col.status !== "pronto" && min >= 25 ? "vermelho" : col.status !== "pronto" && min >= 15 ? "amarelo" : null;
                  return (
                    <div key={p.pedido_id} className={cx("overflow-hidden rounded-2xl border border-t-4 bg-white shadow-sm",
                      col.cor, atraso === "vermelho" ? "border-brasa-200 ring-2 ring-brasa-500/40" : "border-stone-200")}>
                      <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
                        <div>
                          <p className="text-lg font-extrabold">
                            {p.mesa_numero ? `Mesa ${p.mesa_numero}` : NOME_TIPO[p.pedido_tipo]}
                            <span className="ml-1.5 text-sm font-semibold text-stone-400 tabular">#{p.pedido_numero}</span>
                          </p>
                          {p.cliente && <p className="text-sm text-stone-500">{p.cliente}</p>}
                        </div>
                        <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular",
                          atraso === "vermelho" ? "bg-brasa-600 text-white" : atraso === "amarelo" ? "bg-mostarda-100 text-mostarda-700" : "bg-stone-100 text-stone-600")}>
                          <Clock className="size-3.5" />{tempo(min)}
                        </span>
                      </div>
                      <ul className="divide-y divide-stone-100">
                        {t.map((i) => (
                          <li key={i.item_id}>
                            <button onClick={() => avancar([i.item_id], col.proximo)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 active:bg-stone-100">
                              <span className="valor min-w-10 text-xl font-bold text-brasa-700">{qtd(Number(i.quantidade))}</span>
                              <span className="flex-1">
                                <span className="block text-[17px] font-semibold leading-snug">{i.nome_produto}</span>
                                {i.adicionais && <span className="block text-sm text-stone-600">+ {i.adicionais}</span>}
                                {i.observacao && <span className="mt-0.5 block rounded bg-mostarda-100 px-1.5 py-0.5 text-sm font-semibold text-mostarda-700">{i.observacao}</span>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="p-3">
                        <Botao className="w-full" variante={col.status === "preparando" ? "sucesso" : col.status === "pronto" ? "secundario" : "primario"}
                          onClick={() => avancar(t.map((i) => i.item_id), col.proximo)}>
                          {col.acao}{t.length > 1 ? " tudo" : ""}
                        </Botao>
                      </div>
                    </div>
                  );
                })}
                {tickets.length === 0 && <p className="rounded-2xl border border-dashed border-stone-300 py-8 text-center text-sm text-stone-400">Vazio</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
