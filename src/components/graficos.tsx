"use client";

import { useState } from "react";
import { brl, dataCurta, num } from "@/lib/format";
import { cx } from "./ui";

/**
 * Barras verticais de uma série só (ex.: faturamento por dia).
 * Uma cor (terracota), grade discreta, dica ao passar o dedo/mouse.
 */
export function BarrasDiarias({ dados, altura = 220 }: { dados: { dia: string; valor: number; extra?: string }[]; altura?: number }) {
  const [foco, setFoco] = useState<number | null>(null);
  if (dados.length === 0) return <p className="py-10 text-center text-sm text-stone-500">Sem vendas no período.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const passo = niceMax(max);
  const linhas = [0, 0.5, 1].map((f) => f * passo);
  const rotuloCada = Math.ceil(dados.length / 10);

  return (
    <div className="relative select-none">
      <div className="flex gap-2">
        {/* eixo Y */}
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-stone-400 tabular" style={{ height: altura }}>
          {[...linhas].reverse().map((v) => <span key={v}>{abreviar(v)}</span>)}
        </div>
        <div className="relative flex-1">
          {/* grade */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: altura - 24 }}>
            {linhas.map((v) => <div key={v} className="border-t border-stone-100" />)}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: altura - 24 }}>
            {dados.map((d, i) => (
              <div key={d.dia} className="group relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onTouchStart={() => setFoco(i)}>
                <div className={cx("w-full max-w-7 rounded-t-[4px] transition-colors", foco === i ? "bg-brasa-700" : "bg-brasa-500")}
                  style={{ height: `${(d.valor / passo) * 100}%`, minHeight: d.valor > 0 ? 2 : 0 }} />
                {foco === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-carvao-900 px-2.5 py-1.5 text-xs text-white shadow-lg">
                    <p className="font-semibold">{dataCurta(d.dia)}</p>
                    <p className="tabular">{brl(d.valor)}</p>
                    {d.extra && <p className="text-stone-300">{d.extra}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* eixo X */}
          <div className="flex gap-[2px] pt-1.5">
            {dados.map((d, i) => (
              <span key={d.dia} className="flex-1 text-center text-[10px] text-stone-400 tabular">
                {i % rotuloCada === 0 ? dataCurta(d.dia) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lista de barras horizontais com rótulo e valor (ex.: formas de pagamento, ranking). */
export function BarrasHorizontais({ itens, formato = "brl" }: { itens: { rotulo: string; valor: number; detalhe?: string }[]; formato?: "brl" | "num" }) {
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-stone-500">Sem dados no período.</p>;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate font-medium text-stone-800">{i.rotulo}</span>
            <span className="shrink-0 tabular text-stone-600">
              {i.detalhe ?? `${Math.round((i.valor / (total || 1)) * 100)}%`} · <b className="text-stone-900">{formato === "brl" ? brl(i.valor) : num(i.valor, i.valor % 1 ? 3 : 0)}</b>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brasa-50">
            <div className="h-full rounded-full bg-brasa-600" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function abreviar(v: number) {
  return v >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)} mil` : num(v);
}
