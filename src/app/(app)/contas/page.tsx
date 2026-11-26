"use client";

import { useState } from "react";
import { Plus, Search, CalendarDays, Clock, AlertTriangle, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados } from "@/lib/hooks";
import { brl, erroMsg, hojeISO, num, parseValor } from "@/lib/format";
import type { CategoriaDespesa, FormaPagamento, Fornecedor, VwContaPagar } from "@/lib/types";
import { Botao, Campo, Carregando, Cartao, Chave, Entrada, Kpi, Modal, Pilulas, Selecao, Tabela, Titulo, Vazio, cx, useAviso } from "@/components/ui";

type Despesa = { id: string; descricao: string; categoria_id: string | null; fornecedor_id: string | null; valor: number; vencimento: string; observacoes: string | null };
type Filtro = "todos" | "vence_hoje" | "vencida" | "proximos_7_dias" | "a_vencer";
const fmtData = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ContasPage() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const inicioMes = hojeISO().slice(0, 8) + "01";
    const [abertas, pagasMes, categorias, fornecedores] = await Promise.all([
      q<VwContaPagar[]>(sb.from("vw_contas_a_pagar").select("*").order("vencimento")),
      q<{ valor_pago: number }[]>(sb.from("despesas").select("valor_pago").gte("pago_em", inicioMes)),
      q<CategoriaDespesa[]>(sb.from("categorias_despesa").select("*").eq("ativa", true).order("nome")),
      q<Fornecedor[]>(sb.from("fornecedores").select("*").eq("ativo", true).order("nome")),
    ]);
    return { abertas, pagasMes, categorias, fornecedores };
  });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [editando, setEditando] = useState<string | "nova" | null>(null);
  const [pagando, setPagando] = useState<VwContaPagar | null>(null);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Vazio titulo="Não foi possível carregar" texto={erro ?? undefined} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const { abertas } = dados;
  const de = (s: VwContaPagar["situacao"]) => abertas.filter((c) => c.situacao === s);
  const soma = (l: VwContaPagar[]) => l.reduce((s, c) => s + Number(c.valor), 0);
  const fimMes = (() => { const d = new Date(); return hojeISO(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate()); })();
  const doMes = abertas.filter((c) => c.vencimento <= fimMes);
  const pagoMes = dados.pagasMes.reduce((s, p) => s + Number(p.valor_pago), 0);
  const termo = busca.trim().toLowerCase();
  const lista = abertas
    .filter((c) => filtro === "todos" || c.situacao === filtro)
    .filter((c) => !cat || c.categoria === cat)
    .filter((c) => !termo || c.descricao.toLowerCase().includes(termo) || c.fornecedor?.toLowerCase().includes(termo));

  async function excluir(c: VwContaPagar) {
    if (!window.confirm(`Excluir a conta "${c.descricao}"?`)) return;
    const { error } = await supabase().from("despesas").delete().eq("id", c.id);
    if (error) avisar(erroMsg(error), "erro"); else { avisar("Conta excluída"); recarregar(); }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Retaguarda · Financeiro · Contas a pagar" sub="Fornecedores, aluguel, luz, gás e outras despesas. Marque como paga quando pagar."
        acoes={<Botao onClick={() => setEditando("nova")}><Plus className="size-4" /> Nova conta</Botao>}>
        Contas a pagar
      </Titulo>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="A pagar no mês" valor={brl(soma(doMes))} icone={<CalendarDays />} rodape={`${num(doMes.length)} contas até o fim do mês`}
          progresso={soma(doMes) + pagoMes ? (pagoMes / (soma(doMes) + pagoMes)) * 100 : 0} tom="brasa" />
        <Kpi rotulo="Vence hoje" valor={brl(soma(de("vence_hoje")))} tom="mostarda" icone={<Clock />} rodape={`${de("vence_hoje").length} conta(s)`} />
        <Kpi rotulo="Vencidas" valor={brl(soma(de("vencida")))} tom="vermelho" icone={<AlertTriangle />}
          rodape={de("vencida").length ? <span className="font-semibold text-brasa-600">{de("vencida").length} atrasada(s), sujeitas a juros</span> : "Nada atrasado"} />
        <Kpi rotulo="Pago este mês" valor={brl(pagoMes)} tom="verde" icone={<CheckCircle2 />} rodape={`${dados.pagasMes.length} conta(s) quitada(s)`} />
      </div>

      <Cartao className="mb-4 space-y-3 p-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
            <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por fornecedor ou descrição" className="pl-10" />
          </div>
          <Selecao value={cat} onChange={(e) => setCat(e.target.value)} className="w-56">
            <option value="">Todas as categorias</option>
            {dados.categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </Selecao>
        </div>
        <Pilulas valor={filtro} onChange={setFiltro} opcoes={[
          { id: "todos", rotulo: "Todos", qtd: abertas.length },
          { id: "vence_hoje", rotulo: "Vencendo hoje", qtd: de("vence_hoje").length, ponto: "mostarda" },
          { id: "vencida", rotulo: "Vencidos", qtd: de("vencida").length, ponto: "vermelho" },
          { id: "proximos_7_dias", rotulo: "Próximos 7 dias", qtd: de("proximos_7_dias").length },
          { id: "a_vencer", rotulo: "Depois", qtd: de("a_vencer").length },
        ]} />
      </Cartao>

      <Cartao>
        <h2 className="px-4 pt-4 font-bold">Contas pendentes</h2>
        <Tabela cabecalho={["Vencimento", "Descrição / fornecedor", "Categoria", "Valor", ""]}
          vazio={lista.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">Nenhuma conta pendente aqui.</p> : null}>
          {lista.map((c) => (
            <tr key={c.id} className="hover:bg-brasa-50/40">
              <td className="whitespace-nowrap px-4 py-3">
                <p className="font-mono text-sm font-semibold">{fmtData(c.vencimento)}</p>
                <p className={cx("text-[11px] font-bold uppercase",
                  c.situacao === "vencida" ? "text-brasa-600" : c.situacao === "vence_hoje" ? "text-mostarda-700" : "text-stone-400")}>
                  ● {c.situacao === "vencida" ? "Vencida" : c.situacao === "vence_hoje" ? "Vence hoje" : c.situacao === "proximos_7_dias" ? "Esta semana" : "A vencer"}
                </p>
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold">{c.descricao}</p>
                {c.fornecedor && <p className="text-xs text-stone-500">{c.fornecedor}</p>}
              </td>
              <td className="px-4 py-3">{c.categoria && <span className="rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-700">{c.categoria}</span>}</td>
              <td className="px-4 py-3 font-mono font-bold">{brl(c.valor)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Botao tamanho="sm" variante="sucesso" onClick={() => setPagando(c)}>Pagar</Botao>
                  <button onClick={() => setEditando(c.id)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Editar"><Pencil className="size-4" /></button>
                  <button onClick={() => excluir(c)} className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-600" aria-label="Excluir"><Trash2 className="size-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      {editando && <ContaModal id={editando === "nova" ? null : editando} categorias={dados.categorias} fornecedores={dados.fornecedores}
        aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); avisar("Conta salva"); }} />}
      {pagando && <PagarModal conta={pagando} aoFechar={() => setPagando(null)} aoFeito={() => { setPagando(null); recarregar(); avisar("Conta paga"); }} />}
    </div>
  );
}

function ContaModal({ id, categorias, fornecedores, aoFechar, aoSalvar }: {
  id: string | null; categorias: CategoriaDespesa[]; fornecedores: Fornecedor[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const avisar = useAviso();
  const [f, setF] = useState({ descricao: "", categoria_id: "", fornecedor_id: "", valor: "", vencimento: hojeISO(), observacoes: "", repetir: 1 });
  const [novoForn, setNovoForn] = useState("");
  const [listaForn, setListaForn] = useState(fornecedores);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const { carregando } = useDados(async () => {
    if (!id) return null;
    const d = await q<Despesa>(supabase().from("despesas").select("*").eq("id", id).single());
    setF((x) => ({ ...x, descricao: d.descricao, categoria_id: d.categoria_id ?? "", fornecedor_id: d.fornecedor_id ?? "",
      valor: String(d.valor).replace(".", ","), vencimento: d.vencimento, observacoes: d.observacoes ?? "" }));
    return d;
  }, [id]);

  async function criarFornecedor() {
    const { data, error } = await supabase().from("fornecedores").insert({ nome: novoForn.trim() }).select().single();
    if (error) return avisar(erroMsg(error), "erro");
    setListaForn((l) => [...l, data as Fornecedor].sort((a, b) => a.nome.localeCompare(b.nome)));
    set("fornecedor_id", (data as Fornecedor).id); setNovoForn("");
  }

  const valor = parseValor(f.valor);
  const valido = f.descricao.trim() && Number.isFinite(valor) && valor > 0 && f.vencimento;

  async function salvar() {
    setSalvando(true);
    const base = { descricao: f.descricao.trim(), categoria_id: f.categoria_id || null, fornecedor_id: f.fornecedor_id || null,
      valor, observacoes: f.observacoes.trim() || null };
    const sb = supabase();
    let error;
    if (id) ({ error } = await sb.from("despesas").update({ ...base, vencimento: f.vencimento }).eq("id", id));
    else {
      // "repetir" cria uma conta por mês (ex.: aluguel)
      const linhas = Array.from({ length: f.repetir }, (_, i) => {
        const d = new Date(f.vencimento + "T12:00:00"); d.setMonth(d.getMonth() + i);
        const venc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return { ...base, vencimento: venc, descricao: f.repetir > 1 ? `${base.descricao} (${i + 1}/${f.repetir})` : base.descricao };
      });
      ({ error } = await sb.from("despesas").insert(linhas));
    }
    if (error) { avisar(erroMsg(error), "erro"); setSalvando(false); } else aoSalvar();
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={id ? "Editar conta" : "Nova conta a pagar"}
      rodape={<><Botao variante="secundario" className="flex-1" onClick={aoFechar}>Cancelar</Botao>
        <Botao className="flex-1" disabled={!valido} carregando={salvando} onClick={salvar}>Salvar</Botao></>}>
      {carregando && id ? <Carregando /> : (
        <div className="space-y-4">
          <Campo rotulo="Descrição"><Entrada value={f.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: Carne da semana, conta de luz" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor (R$)"><Entrada inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} className="valor" /></Campo>
            <Campo rotulo="Vencimento"><Entrada type="date" value={f.vencimento} onChange={(e) => set("vencimento", e.target.value)} /></Campo>
          </div>
          <Campo rotulo="Categoria">
            <Selecao value={f.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
              <option value="">—</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Fornecedor">
            <Selecao value={f.fornecedor_id} onChange={(e) => set("fornecedor_id", e.target.value)}>
              <option value="">—</option>
              {listaForn.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <div className="flex gap-2">
            <Entrada value={novoForn} onChange={(e) => setNovoForn(e.target.value)} placeholder="Cadastrar fornecedor novo" />
            <Botao variante="suave" disabled={!novoForn.trim()} onClick={criarFornecedor}>Adicionar</Botao>
          </div>
          {!id && (
            <Campo rotulo="Repetir todo mês" dica="Para contas fixas, como aluguel. Cria uma conta para cada mês.">
              <Selecao value={f.repetir} onChange={(e) => set("repetir", Number(e.target.value))}>
                {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n === 1 ? "Não repetir" : `${n} meses`}</option>)}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Observações"><Entrada value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Nº do boleto, nota fiscal..." /></Campo>
        </div>
      )}
    </Modal>
  );
}

function PagarModal({ conta, aoFechar, aoFeito }: { conta: VwContaPagar; aoFechar: () => void; aoFeito: () => void }) {
  const avisar = useAviso();
  const { dados: formas } = useDados(() =>
    q<FormaPagamento[]>(supabase().from("formas_pagamento").select("*").eq("ativa", true).neq("tipo", "fiado").order("ordem")));
  const [forma, setForma] = useState("");
  const [v, setV] = useState("");
  const [doCaixa, setDoCaixa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const f = formas?.find((x) => x.id === forma);
  const valor = v ? parseValor(v) : Number(conta.valor);
  async function ok() {
    setEnviando(true);
    try {
      await rpc("pagar_despesa", { p_despesa: conta.id, p_forma: forma, p_valor_pago: valor, p_do_caixa: doCaixa && f?.tipo === "dinheiro" });
      aoFeito();
    } catch (e) { avisar(erroMsg(e), "erro"); setEnviando(false); }
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Pagar conta" largura="sm"
      rodape={<Botao className="w-full" variante="sucesso" disabled={!forma || !(valor > 0)} carregando={enviando} onClick={ok}>Confirmar pagamento</Botao>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-stone-50 p-3">
          <p className="font-semibold">{conta.descricao}</p>
          <p className="text-sm text-stone-500">{conta.fornecedor ?? "Sem fornecedor"} · vence {fmtData(conta.vencimento)}</p>
        </div>
        <Campo rotulo="Valor pago" dica="Mude se pagou com juros ou desconto.">
          <Entrada inputMode="decimal" value={v} placeholder={brl(conta.valor)} onChange={(e) => setV(e.target.value)} className="valor" />
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <Selecao value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">Escolha</option>
            {(formas ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </Selecao>
        </Campo>
        {f?.tipo === "dinheiro" && (
          <Chave ligado={doCaixa} onChange={setDoCaixa} rotulo="O dinheiro saiu da gaveta do caixa aberto" />
        )}
      </div>
    </Modal>
  );
}
