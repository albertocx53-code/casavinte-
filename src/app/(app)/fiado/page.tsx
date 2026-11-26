"use client";

import { useState } from "react";
import { Plus, Search, Users, HandCoins, AlertTriangle, Pencil, History, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados } from "@/lib/hooks";
import { brl, dataHora, erroMsg, num, parseValor } from "@/lib/format";
import type { Cliente, FormaPagamento, VwFiadoSaldo } from "@/lib/types";
import { Botao, Campo, Carregando, Cartao, Chave, Entrada, Etiqueta, Kpi, Modal, Pilulas, Selecao, Tabela, Titulo, Vazio, cx, useAviso } from "@/components/ui";

type Lanc = { id: string; tipo: "debito" | "pagamento" | "ajuste"; valor: number; descricao: string | null; created_at: string };

export default function FiadoPage() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [clientes, saldos] = await Promise.all([
      q<Cliente[]>(sb.from("clientes").select("*").order("nome")),
      q<VwFiadoSaldo[]>(sb.from("vw_fiado_saldos").select("*")),
    ]);
    return { clientes, saldos };
  });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "devendo" | "inativos">("todos");
  const [editando, setEditando] = useState<Cliente | "novo" | null>(null);
  const [recebendo, setRecebendo] = useState<Cliente | null>(null);
  const [extrato, setExtrato] = useState<Cliente | null>(null);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Vazio titulo="Não foi possível carregar" texto={erro ?? undefined} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const saldo = (id: string) => Number(dados.saldos.find((s) => s.cliente_id === id)?.saldo ?? 0);
  const ultimoPg = (id: string) => dados.saldos.find((s) => s.cliente_id === id)?.ultimo_pagamento;
  const devendo = dados.clientes.filter((c) => saldo(c.id) > 0);
  const totalReceber = devendo.reduce((s, c) => s + saldo(c.id), 0);
  const estourados = devendo.filter((c) => c.limite_fiado != null && saldo(c.id) >= Number(c.limite_fiado));
  const termo = busca.trim().toLowerCase();
  const lista = dados.clientes
    .filter((c) => filtro === "inativos" ? !c.ativo : filtro === "devendo" ? saldo(c.id) > 0 : c.ativo)
    .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.telefone?.includes(termo) || c.documento?.includes(termo))
    .sort((a, b) => filtro === "devendo" ? saldo(b.id) - saldo(a.id) : 0);

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Retaguarda · Clientes & Fiado" sub="Cadastro de clientes para delivery e para vender no fiado, com o saldo de cada um."
        acoes={<Botao onClick={() => setEditando("novo")}><Plus className="size-4" /> Novo cliente</Botao>}>
        Clientes
      </Titulo>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Clientes cadastrados" valor={num(dados.clientes.filter((c) => c.ativo).length)} icone={<Users />} />
        <Kpi rotulo="Devendo" valor={num(devendo.length)} tom="mostarda" icone={<HandCoins />} rodape="Clientes com saldo no fiado" />
        <Kpi rotulo="Total a receber" valor={brl(totalReceber)} tom="vermelho" icone={<HandCoins />} />
        <Kpi rotulo="No limite" valor={num(estourados.length)} tom={estourados.length ? "vermelho" : "neutro"} icone={<AlertTriangle />}
          rodape="Não podem comprar mais fiado" />
      </div>

      <Cartao className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou CPF" className="pl-10" />
        </div>
        <Pilulas valor={filtro} onChange={setFiltro} opcoes={[
          { id: "todos", rotulo: "Ativos" }, { id: "devendo", rotulo: "Devendo", qtd: devendo.length, ponto: "vermelho" }, { id: "inativos", rotulo: "Inativos" },
        ]} />
      </Cartao>

      <Cartao>
        <Tabela cabecalho={["Nome e contato", "CPF / Doc.", "Saldo fiado", "Limite", "Último pagamento", ""]}
          vazio={lista.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">Nenhum cliente encontrado.</p> : null}>
          {lista.map((c) => {
            const s = saldo(c.id);
            const noLimite = c.limite_fiado != null && s >= Number(c.limite_fiado);
            return (
              <tr key={c.id} className="hover:bg-brasa-50/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brasa-100 text-sm font-bold text-brasa-700">
                      {c.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold">{c.nome} {!c.ativo && <Etiqueta>Inativo</Etiqueta>}</p>
                      {c.telefone && <p className="inline-flex items-center gap-1 text-xs text-stone-500"><Phone className="size-3" />{c.telefone}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-stone-600">{c.documento ?? "—"}</td>
                <td className="px-4 py-3">
                  {s > 0 ? <span className={cx("font-mono font-bold", noLimite ? "text-brasa-600" : "text-stone-900")}>{brl(s)}</span>
                    : <span className="text-stone-400">—</span>}
                  {noLimite && <Etiqueta tom="vermelho" className="ml-2">No limite</Etiqueta>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-stone-600">{c.limite_fiado != null ? brl(c.limite_fiado) : "Sem limite"}</td>
                <td className="px-4 py-3 text-xs text-stone-500">{ultimoPg(c.id) ? dataHora(ultimoPg(c.id)!) : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {s > 0 && <Botao tamanho="sm" variante="sucesso" onClick={() => setRecebendo(c)}>Receber</Botao>}
                    <button onClick={() => setExtrato(c)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Extrato"><History className="size-4" /></button>
                    <button onClick={() => setEditando(c)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Editar"><Pencil className="size-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Tabela>
      </Cartao>

      {editando && <ClienteModal cliente={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)}
        aoSalvar={() => { setEditando(null); recarregar(); avisar("Cliente salvo"); }} />}
      {recebendo && <ReceberModal cliente={recebendo} saldo={saldo(recebendo.id)} aoFechar={() => setRecebendo(null)}
        aoFeito={() => { setRecebendo(null); recarregar(); }} />}
      {extrato && <ExtratoModal cliente={extrato} aoFechar={() => setExtrato(null)} />}
    </div>
  );
}

function ClienteModal({ cliente, aoFechar, aoSalvar }: { cliente: Cliente | null; aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useAviso();
  const [f, setF] = useState({
    nome: cliente?.nome ?? "", telefone: cliente?.telefone ?? "", documento: cliente?.documento ?? "",
    endereco: cliente?.endereco ?? "", observacoes: cliente?.observacoes ?? "",
    limite: cliente?.limite_fiado != null ? String(cliente.limite_fiado).replace(".", ",") : "", ativo: cliente?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    setSalvando(true);
    const reg = {
      nome: f.nome.trim(), telefone: f.telefone.trim() || null, documento: f.documento.trim() || null,
      endereco: f.endereco.trim() || null, observacoes: f.observacoes.trim() || null,
      limite_fiado: f.limite.trim() ? parseValor(f.limite) : null, ativo: f.ativo,
    };
    const sb = supabase();
    const { error } = cliente ? await sb.from("clientes").update(reg).eq("id", cliente.id) : await sb.from("clientes").insert(reg);
    if (error) { avisar(erroMsg(error), "erro"); setSalvando(false); } else aoSalvar();
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo={cliente ? "Editar cliente" : "Novo cliente"}
      rodape={<><Botao variante="secundario" className="flex-1" onClick={aoFechar}>Cancelar</Botao>
        <Botao className="flex-1" disabled={!f.nome.trim()} carregando={salvando} onClick={salvar}>Salvar</Botao></>}>
      <div className="space-y-4">
        <Campo rotulo="Nome completo"><Entrada value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Celular / WhatsApp"><Entrada value={f.telefone} inputMode="tel" onChange={(e) => set("telefone", e.target.value)} placeholder="(99) 99999-9999" /></Campo>
          <Campo rotulo="CPF ou CNPJ"><Entrada value={f.documento} inputMode="numeric" onChange={(e) => set("documento", e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Endereço (para delivery)"><Entrada value={f.endereco} onChange={(e) => set("endereco", e.target.value)} /></Campo>
        <Campo rotulo="Limite do fiado (R$)" dica="Deixe vazio para não ter limite.">
          <Entrada value={f.limite} inputMode="decimal" onChange={(e) => set("limite", e.target.value)} className="valor" />
        </Campo>
        <Campo rotulo="Observações"><Entrada value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
        {cliente && <Chave ligado={f.ativo} onChange={(v) => set("ativo", v)} rotulo="Cliente ativo" />}
      </div>
    </Modal>
  );
}

function ReceberModal({ cliente, saldo, aoFechar, aoFeito }: { cliente: Cliente; saldo: number; aoFechar: () => void; aoFeito: () => void }) {
  const avisar = useAviso();
  const { dados: formas } = useDados(() =>
    q<FormaPagamento[]>(supabase().from("formas_pagamento").select("*").eq("ativa", true).neq("tipo", "fiado").order("ordem")));
  const [forma, setForma] = useState("");
  const [v, setV] = useState("");
  const [enviando, setEnviando] = useState(false);
  const valor = v ? parseValor(v) : saldo;
  const valido = forma && Number.isFinite(valor) && valor > 0 && valor <= saldo + 0.001;
  async function ok() {
    setEnviando(true);
    try {
      await rpc("receber_fiado", { p_cliente: cliente.id, p_valor: valor, p_forma: forma });
      avisar(`${brl(valor)} recebido de ${cliente.nome}`); aoFeito();
    } catch (e) { avisar(erroMsg(e), "erro"); setEnviando(false); }
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Receber de ${cliente.nome}`} largura="sm"
      rodape={<Botao className="w-full" variante="sucesso" disabled={!valido} carregando={enviando} onClick={ok}>Receber {brl(Number.isFinite(valor) ? valor : 0)}</Botao>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-brasa-700 p-4 text-white">
          <p className="text-sm text-brasa-200">Saldo devedor</p>
          <p className="valor text-3xl font-bold">{brl(saldo)}</p>
        </div>
        <Campo rotulo="Valor recebido" dica="Deixe vazio para quitar tudo.">
          <Entrada inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={brl(saldo)} className="valor" />
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <Selecao value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">Escolha</option>
            {(formas ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </Selecao>
        </Campo>
        <p className="text-xs text-stone-500">Precisa de caixa aberto. Se for em dinheiro, o valor entra na gaveta.</p>
      </div>
    </Modal>
  );
}

function ExtratoModal({ cliente, aoFechar }: { cliente: Cliente; aoFechar: () => void }) {
  const { dados, carregando } = useDados(() =>
    q<Lanc[]>(supabase().from("fiado_lancamentos").select("id,tipo,valor,descricao,created_at").eq("cliente_id", cliente.id).order("created_at", { ascending: false }).limit(100)));
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Extrato · ${cliente.nome}`} largura="lg">
      {carregando ? <Carregando /> : (dados ?? []).length === 0 ? <p className="py-6 text-center text-sm text-stone-500">Nenhuma movimentação no fiado.</p> : (
        <ul className="divide-y divide-stone-100">
          {dados!.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <span className="block font-medium">{l.descricao ?? (l.tipo === "debito" ? "Compra" : "Pagamento")}</span>
                <span className="text-xs text-stone-500">{dataHora(l.created_at)}</span>
              </span>
              <span className={cx("font-mono font-bold", Number(l.valor) > 0 ? "text-brasa-600" : "text-emerald-700")}>
                {Number(l.valor) > 0 ? "+" : "−"}{brl(Math.abs(Number(l.valor)))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
