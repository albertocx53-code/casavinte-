"use client";

import Link from "next/link";
import { TrendingUp, Receipt, ClipboardList, HandCoins, AlertTriangle, CalendarClock, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, useDados, useTempoReal } from "@/lib/hooks";
import { brl, hojeISO, num } from "@/lib/format";
import type { VwContaPagar, VwPainelHoje, VwProdutosVendidos, VwVendasDiarias, VwVendasPorForma } from "@/lib/types";
import { Botao, Carregando, Cartao, Etiqueta, Kpi, Titulo, Vazio } from "@/components/ui";
import { BarrasDiarias, BarrasHorizontais } from "@/components/graficos";

export default function PainelPage() {
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const hoje = hojeISO();
    const [painel, dias, formas, produtos, contas] = await Promise.all([
      q<VwPainelHoje>(sb.from("vw_painel_hoje").select("*").single()),
      q<VwVendasDiarias[]>(sb.from("vw_vendas_diarias").select("*").gte("dia", hojeISO(-29)).order("dia")),
      q<VwVendasPorForma[]>(sb.from("vw_vendas_por_forma").select("*").eq("dia", hoje)),
      q<VwProdutosVendidos[]>(sb.from("vw_produtos_vendidos").select("*").eq("dia", hoje).order("quantidade", { ascending: false }).limit(5)),
      q<VwContaPagar[]>(sb.from("vw_contas_a_pagar").select("*").in("situacao", ["vencida", "vence_hoje", "proximos_7_dias"]).order("vencimento").limit(5)),
    ]);
    return { painel, dias, formas, produtos, contas };
  });
  useTempoReal(["pedidos"], recarregar);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Vazio titulo="Não foi possível carregar" texto={erro ?? undefined} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const { painel: p, dias, formas, produtos, contas } = dados;
  // preenche os dias sem venda com zero
  const serie = Array.from({ length: 30 }, (_, i) => {
    const dia = hojeISO(i - 29);
    const d = dias.find((x) => x.dia === dia);
    return { dia, valor: Number(d?.faturamento ?? 0), extra: d ? `${d.pedidos} pedidos` : "Sem vendas" };
  });
  const total30 = serie.reduce((s, d) => s + d.valor, 0);
  const diasComVenda = serie.filter((d) => d.valor > 0).length;
  const mediaDia = diasComVenda ? total30 / diasComVenda : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Retaguarda · Visão geral" sub="Como está o restaurante hoje. Atualiza sozinho quando uma comanda fecha."
        acoes={<Link href="/relatorios"><Botao variante="suave">Ver relatórios</Botao></Link>}>
        Painel do dia
      </Titulo>

      {Number(p.comandas_esquecidas) > 0 && (
        <Link href="/mesas" className="mb-4 flex items-center gap-2 rounded-xl bg-mostarda-100 px-4 py-3 text-sm font-semibold text-mostarda-700">
          <AlertTriangle className="size-4" /> {p.comandas_esquecidas} comanda(s) aberta(s) há mais de 3 horas. Verifique se foram esquecidas.
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Vendas hoje" valor={brl(p.vendas_hoje)} tom="verde" icone={<TrendingUp />}
          rodape={`${num(p.pedidos_hoje)} pedidos fechados`}
          progresso={mediaDia ? (Number(p.vendas_hoje) / mediaDia) * 100 : undefined} />
        <Kpi rotulo="Ticket médio" valor={brl(p.ticket_medio_hoje)} icone={<Receipt />} rodape="Por pedido, hoje" />
        <Kpi rotulo="Em aberto agora" valor={brl(p.valor_em_aberto)} tom="mostarda" icone={<ClipboardList />}
          rodape={`${num(p.comandas_abertas)} comandas abertas`} />
        <Kpi rotulo="Fiado a receber" valor={brl(p.fiado_a_receber)} tom="vermelho" icone={<HandCoins />}
          rodape={<Link href="/fiado" className="font-semibold text-brasa-700">Ver clientes →</Link>} />
      </div>
      {mediaDia > 0 && (
        <p className="mt-2 text-xs text-stone-500">A barra de &quot;Vendas hoje&quot; compara com a média de {brl(mediaDia)} por dia de funcionamento nos últimos 30 dias.</p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <Cartao className="p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-bold">Faturamento dos últimos 30 dias</h2>
              <p className="text-sm text-stone-500">Total <b className="text-stone-800 tabular">{brl(total30)}</b> · média {brl(mediaDia)} por dia aberto</p>
            </div>
          </div>
          <BarrasDiarias dados={serie} />
        </Cartao>

        <div className="space-y-5">
          <Cartao className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Formas de pagamento</h2>
              <Etiqueta tom="verde">HOJE</Etiqueta>
            </div>
            <BarrasHorizontais itens={formas.sort((a, b) => b.total - a.total).map((f) => ({ rotulo: f.forma, valor: Number(f.total) }))} />
          </Cartao>
          <Cartao className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Caixa</h2>
              {p.caixa ? <Etiqueta tom="verde">ABERTO</Etiqueta> : <Etiqueta>FECHADO</Etiqueta>}
            </div>
            <Link href="/caixa"><Botao variante="suave" className="w-full"><Wallet className="size-4" /> Ir para o caixa</Botao></Link>
          </Cartao>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Cartao className="p-5">
          <h2 className="mb-4 font-bold">Mais vendidos hoje</h2>
          <BarrasHorizontais formato="num" itens={produtos.map((x) => ({ rotulo: x.produto, valor: Number(x.quantidade), detalhe: brl(x.faturamento) }))} />
        </Cartao>
        <Cartao className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Contas para pagar</h2>
            <span className="text-sm text-stone-500">7 dias: <b className="text-stone-800 tabular">{brl(p.contas_proximos_7_dias)}</b></span>
          </div>
          {contas.length === 0 ? <p className="text-sm text-stone-500">Nenhuma conta vencendo nos próximos 7 dias.</p> : (
            <ul className="divide-y divide-stone-100">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.descricao}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-stone-500"><CalendarClock className="size-3" />
                      {c.situacao === "vencida" ? <b className="text-brasa-600">Vencida</b> : c.situacao === "vence_hoje" ? <b className="text-mostarda-700">Vence hoje</b> : new Date(c.vencimento + "T12:00").toLocaleDateString("pt-BR")}
                    </span>
                  </span>
                  <span className="font-semibold tabular">{brl(c.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/contas" className="mt-3 inline-block text-sm font-semibold text-brasa-700">Ver todas →</Link>
        </Cartao>
      </div>
    </div>
  );
}
