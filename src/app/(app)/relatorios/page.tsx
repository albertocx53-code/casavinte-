"use client";

import { useMemo, useState } from "react";
import { Download, TrendingUp, Receipt, Percent, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, useDados } from "@/lib/hooks";
import { brl, hojeISO, num } from "@/lib/format";
import type { VwProdutosVendidos, VwVendasDiarias, VwVendasPorForma } from "@/lib/types";
import { Botao, Carregando, Cartao, Entrada, Kpi, Pilulas, Tabela, Titulo, Vazio, cx } from "@/components/ui";
import { BarrasDiarias, BarrasHorizontais } from "@/components/graficos";

type Periodo = "hoje" | "7" | "30" | "mes" | "mes_passado" | "outro";

function intervalo(p: Periodo, de: string, ate: string): [string, string] {
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (p) {
    case "hoje": return [hojeISO(), hojeISO()];
    case "7": return [hojeISO(-6), hojeISO()];
    case "30": return [hojeISO(-29), hojeISO()];
    case "mes": return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), hojeISO()];
    case "mes_passado": return [iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
    default: return [de || hojeISO(-29), ate || hojeISO()];
  }
}

function diasEntre(de: string, ate: string) {
  const out: string[] = [];
  const d = new Date(de + "T12:00:00"); const fim = new Date(ate + "T12:00:00");
  while (d <= fim && out.length < 400) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [de, setDe] = useState(hojeISO(-29));
  const [ate, setAte] = useState(hojeISO());
  const [ini, fim] = intervalo(periodo, de, ate);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [dias, formas, produtos] = await Promise.all([
      q<VwVendasDiarias[]>(sb.from("vw_vendas_diarias").select("*").gte("dia", ini).lte("dia", fim).order("dia")),
      q<VwVendasPorForma[]>(sb.from("vw_vendas_por_forma").select("*").gte("dia", ini).lte("dia", fim)),
      q<VwProdutosVendidos[]>(sb.from("vw_produtos_vendidos").select("*").gte("dia", ini).lte("dia", fim)),
    ]);
    return { dias, formas, produtos };
  }, [ini, fim]);

  const r = useMemo(() => {
    if (!dados) return null;
    const soma = (k: keyof VwVendasDiarias) => dados.dias.reduce((s, d) => s + Number(d[k] ?? 0), 0);
    const faturamento = soma("faturamento"), pedidos = soma("pedidos");
    const porForma = new Map<string, number>();
    dados.formas.forEach((f) => porForma.set(f.forma, (porForma.get(f.forma) ?? 0) + Number(f.total)));
    const porProduto = new Map<string, { produto: string; categoria: string; qtd: number; fat: number; custo: number | null }>();
    dados.produtos.forEach((p) => {
      const a = porProduto.get(p.produto_id) ?? { produto: p.produto, categoria: p.categoria, qtd: 0, fat: 0, custo: null };
      a.qtd += Number(p.quantidade); a.fat += Number(p.faturamento);
      if (p.custo_estimado != null) a.custo = (a.custo ?? 0) + Number(p.custo_estimado);
      porProduto.set(p.produto_id, a);
    });
    const porCategoria = new Map<string, number>();
    porProduto.forEach((p) => porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + p.fat));
    return {
      faturamento, pedidos, ticket: pedidos ? faturamento / pedidos : 0,
      descontos: soma("descontos"), servico: soma("taxa_servico"),
      canais: [
        { rotulo: "Mesa", valor: soma("pedidos_mesa") }, { rotulo: "Balcão", valor: soma("pedidos_balcao") },
        { rotulo: "Delivery", valor: soma("pedidos_delivery") }, { rotulo: "iFood / 99Food", valor: soma("pedidos_apps") },
      ].filter((c) => c.valor > 0),
      formas: [...porForma].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
      categorias: [...porCategoria].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
      produtos: [...porProduto.values()].sort((a, b) => b.fat - a.fat),
      serie: diasEntre(ini, fim).map((dia) => {
        const d = dados.dias.find((x) => x.dia === dia);
        return { dia, valor: Number(d?.faturamento ?? 0), extra: d ? `${d.pedidos} pedidos · ticket ${brl(d.ticket_medio)}` : "Sem vendas" };
      }),
    };
  }, [dados, ini, fim]);

  function exportar() {
    if (!r) return;
    const linhas = [["Produto", "Categoria", "Quantidade", "Faturamento", "Custo estimado"],
      ...r.produtos.map((p) => [p.produto, p.categoria, String(p.qtd).replace(".", ","), p.fat.toFixed(2).replace(".", ","), p.custo != null ? p.custo.toFixed(2).replace(".", ",") : ""])];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `vendas-produtos-${ini}-a-${fim}.csv`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Retaguarda · Relatórios" sub="Vendas fechadas no período. Comandas abertas e canceladas não entram."
        acoes={<Botao variante="suave" onClick={exportar} disabled={!r?.produtos.length}><Download className="size-4" /> Exportar planilha</Botao>}>
        Relatórios de vendas
      </Titulo>

      <Cartao className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <span className="pl-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">Período</span>
        <div className="min-w-0 flex-1">
          <Pilulas valor={periodo} onChange={setPeriodo} opcoes={[
            { id: "hoje", rotulo: "Hoje" }, { id: "7", rotulo: "7 dias" }, { id: "30", rotulo: "30 dias" },
            { id: "mes", rotulo: "Este mês" }, { id: "mes_passado", rotulo: "Mês passado" }, { id: "outro", rotulo: "Escolher datas" },
          ]} />
        </div>
        {periodo === "outro" && (
          <div className="flex items-center gap-2">
            <Entrada type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 w-40" />
            <span className="text-stone-400">até</span>
            <Entrada type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 w-40" />
          </div>
        )}
      </Cartao>

      {carregando ? <Carregando /> : erro || !r ? (
        <Vazio titulo="Não foi possível carregar" texto={erro ?? undefined} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Faturamento" valor={brl(r.faturamento)} tom="verde" icone={<TrendingUp />} rodape={`${num(r.pedidos)} pedidos`} />
            <Kpi rotulo="Ticket médio" valor={brl(r.ticket)} icone={<Receipt />} rodape="Por pedido" />
            <Kpi rotulo="Taxa de serviço" valor={brl(r.servico)} tom="mostarda" icone={<ShoppingBag />} rodape="Repasse aos garçons" />
            <Kpi rotulo="Descontos dados" valor={brl(r.descontos)} tom="vermelho" icone={<Percent />}
              rodape={r.faturamento ? `${num((r.descontos / (r.faturamento + r.descontos)) * 100, 1)}% das vendas` : "—"} />
          </div>

          {periodo !== "hoje" && (
            <Cartao className="mt-5 p-5">
              <h2 className="mb-4 font-bold">Faturamento por dia</h2>
              <BarrasDiarias dados={r.serie} />
            </Cartao>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Cartao className="p-5"><h2 className="mb-4 font-bold">Formas de pagamento</h2><BarrasHorizontais itens={r.formas} /></Cartao>
            <Cartao className="p-5"><h2 className="mb-4 font-bold">Por categoria</h2><BarrasHorizontais itens={r.categorias} /></Cartao>
            <Cartao className="p-5"><h2 className="mb-4 font-bold">Pedidos por canal</h2>
              <BarrasHorizontais formato="num" itens={r.canais} /></Cartao>
          </div>

          <Cartao className="mt-5">
            <h2 className="px-4 pt-4 font-bold">Produtos vendidos</h2>
            <Tabela cabecalho={["#", "Produto", "Categoria", "Qtd.", "Faturamento", "Margem"]}
              vazio={r.produtos.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">Sem vendas no período.</p> : null}>
              {r.produtos.map((p, i) => {
                const margem = p.custo != null && p.fat ? ((p.fat - p.custo) / p.fat) * 100 : null;
                return (
                  <tr key={p.produto} className="hover:bg-brasa-50/40">
                    <td className="px-4 py-2.5 text-stone-400 tabular">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{p.produto}</td>
                    <td className="px-4 py-2.5 text-stone-500">{p.categoria}</td>
                    <td className="px-4 py-2.5 tabular">{num(p.qtd, p.qtd % 1 ? 3 : 0)}</td>
                    <td className="px-4 py-2.5 font-semibold tabular">{brl(p.fat)}</td>
                    <td className={cx("px-4 py-2.5 font-mono text-xs", margem == null ? "text-stone-400" : margem < 50 ? "text-brasa-600" : "text-emerald-700")}>
                      {margem == null ? "sem custo" : `${num(margem)}%`}
                    </td>
                  </tr>
                );
              })}
            </Tabela>
          </Cartao>
        </>
      )}
    </div>
  );
}
