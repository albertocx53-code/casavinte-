"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Minus, MessageSquarePlus } from "lucide-react";
import { brl, num, parseValor } from "@/lib/format";
import type { Adicional, Categoria, Produto, ProdutoAdicional } from "@/lib/types";
import { Botao, Campo, Entrada, Modal, cx } from "@/components/ui";

export type DadosCardapio = {
  categorias: Categoria[];
  produtos: Produto[];
  adicionais: Adicional[];
  vinculos: ProdutoAdicional[];
};

export type NovoItem = { produto: Produto; quantidade: number; adicionais: string[]; observacao: string };

/** Grade do cardápio: busca, categorias e produtos. Toque rápido adiciona 1 unidade. */
export function Cardapio({ dados, aoAdicionar }: { dados: DadosCardapio; aoAdicionar: (i: NovoItem) => void }) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string>(dados.categorias[0]?.id ?? "");
  const [detalhe, setDetalhe] = useState<Produto | null>(null);

  const adicionaisDe = useMemo(() => {
    const mapa = new Map<string, Adicional[]>();
    for (const v of dados.vinculos) {
      const a = dados.adicionais.find((x) => x.id === v.adicional_id && x.ativo);
      if (a) mapa.set(v.produto_id, [...(mapa.get(v.produto_id) ?? []), a]);
    }
    return mapa;
  }, [dados]);

  const termo = busca.trim().toLowerCase();
  const lista = dados.produtos.filter((p) =>
    termo ? p.nome.toLowerCase().includes(termo) || p.codigo?.toLowerCase() === termo : p.categoria_id === cat);

  function tocar(p: Produto) {
    if (!p.disponivel) return;
    if (p.unidade === "KG" || adicionaisDe.has(p.id)) setDetalhe(p);
    else aoAdicionar({ produto: p, quantidade: 1, adicionais: [], observacao: "" });
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
        <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou código"
          className="pl-10" onKeyDown={(e) => {
            if (e.key === "Enter" && lista.length === 1) { tocar(lista[0]); setBusca(""); }
          }} />
      </div>
      {!termo && (
        <div className="scroll-fino -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {dados.categorias.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={cx("h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
                cat === c.id ? "bg-brasa-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50")}>
              {c.nome}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {lista.map((p) => (
          <div key={p.id} className="relative">
            <button onClick={() => tocar(p)} disabled={!p.disponivel}
              className={cx("flex h-full min-h-24 w-full flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all active:scale-[0.97]",
                p.disponivel ? "border-stone-200 hover:border-brasa-500 hover:shadow-sm" : "border-stone-200 opacity-50")}>
              {p.imagem_url && <img src={p.imagem_url} alt="" className="h-20 w-full object-cover" />}
              <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                <span className="line-clamp-2 pr-6 text-sm font-semibold leading-snug text-stone-900">{p.nome}</span>
                <span className="text-sm font-bold text-brasa-700 tabular">
                  {brl(p.preco)}{p.unidade === "KG" && <span className="font-normal text-stone-500">/kg</span>}
                </span>
                {!p.disponivel && <span className="text-xs font-semibold text-red-600">Esgotado</span>}
              </div>
            </button>
            {p.disponivel && (
              <button onClick={() => setDetalhe(p)} aria-label={`Adicionar ${p.nome} com observação`}
                className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-stone-500 shadow-sm ring-1 ring-stone-200 hover:text-brasa-700">
                <MessageSquarePlus className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {lista.length === 0 && <p className="py-8 text-center text-sm text-stone-500">Nenhum produto encontrado.</p>}

      {detalhe && (
        <ItemModal produto={detalhe} adicionais={adicionaisDe.get(detalhe.id) ?? []}
          aoFechar={() => setDetalhe(null)}
          aoConfirmar={(i) => { aoAdicionar(i); setDetalhe(null); }} />
      )}
    </div>
  );
}

const OBS_RAPIDAS = ["Sem cebola", "Sem salada", "Mal passado", "Ao ponto", "Bem passado", "Para viagem", "Sem gelo"];

function ItemModal({ produto, adicionais, aoFechar, aoConfirmar }: {
  produto: Produto; adicionais: Adicional[]; aoFechar: () => void; aoConfirmar: (i: NovoItem) => void;
}) {
  const kg = produto.unidade === "KG";
  const [qtd, setQtd] = useState(1);
  const [peso, setPeso] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [obs, setObs] = useState("");

  const quantidade = kg ? parseValor(peso) : qtd;
  const extra = adicionais.filter((a) => sel.includes(a.id)).reduce((s, a) => s + Number(a.preco), 0);
  const total = Number.isFinite(quantidade) ? quantidade * (Number(produto.preco) + extra) : 0;
  const valido = Number.isFinite(quantidade) && quantidade > 0;

  const alternarObs = (o: string) =>
    setObs((atual) => atual.includes(o) ? atual.replace(o, "").replace(/^,\s*|,\s*$|,\s*,/g, "").trim() : atual ? `${atual}, ${o}` : o);

  return (
    <Modal aberto aoFechar={aoFechar} titulo={produto.nome}
      rodape={<Botao className="w-full" tamanho="lg" disabled={!valido}
        onClick={() => aoConfirmar({ produto, quantidade, adicionais: sel, observacao: obs.trim() })}>
        Adicionar · {brl(total)}
      </Botao>}>
      <div className="space-y-5">
        {kg ? (
          <Campo rotulo="Peso (kg)" dica={`${brl(produto.preco)} o quilo. Ex.: 0,450`}>
            <Entrada inputMode="decimal" autoFocus value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="0,000" />
          </Campo>
        ) : (
          <div className="flex items-center justify-center gap-6">
            <button onClick={() => setQtd(Math.max(1, qtd - 1))} className="flex size-12 items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200" aria-label="Menos">
              <Minus className="size-5" />
            </button>
            <span className="w-12 text-center text-3xl font-bold tabular">{num(qtd)}</span>
            <button onClick={() => setQtd(qtd + 1)} className="flex size-12 items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200" aria-label="Mais">
              <Plus className="size-5" />
            </button>
          </div>
        )}

        {adicionais.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Adicionais</p>
            <div className="space-y-2">
              {adicionais.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 has-checked:border-brasa-500 has-checked:bg-brasa-50">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-brasa-600" checked={sel.includes(a.id)}
                      onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />
                    {a.nome}
                  </span>
                  <span className="text-sm text-stone-600 tabular">+ {brl(a.preco)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Observação</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {OBS_RAPIDAS.map((o) => (
              <button key={o} onClick={() => alternarObs(o)}
                className={cx("rounded-full px-3 py-1.5 text-sm", obs.includes(o) ? "bg-brasa-600 text-white" : "bg-stone-100 text-stone-700")}>
                {o}
              </button>
            ))}
          </div>
          <Entrada value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Escreva outra observação" />
        </div>
      </div>
    </Modal>
  );
}
