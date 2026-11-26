"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, useDados } from "@/lib/hooks";
import { erroMsg, NOME_PAPEL, parseValor, dataHora } from "@/lib/format";
import { useSessao } from "@/lib/sessao";
import type { Configuracoes, FormaPagamento, Mesa, Papel, Perfil, TipoForma } from "@/lib/types";
import { Abas, Botao, Campo, Carregando, Cartao, Chave, Entrada, Etiqueta, Selecao, Tabela, Titulo, Vazio, useAviso } from "@/components/ui";

type Aba = "equipe" | "restaurante" | "mesas" | "pagamentos";

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>("equipe");
  return (
    <div className="mx-auto max-w-5xl">
      <Titulo modulo="Retaguarda · Configurações" sub="Só o dono vê esta tela.">Configurações</Titulo>
      <div className="mb-5">
        <Abas valor={aba} onChange={setAba} abas={[
          { id: "equipe", rotulo: "Equipe" }, { id: "restaurante", rotulo: "Restaurante" },
          { id: "mesas", rotulo: "Mesas" }, { id: "pagamentos", rotulo: "Formas de pagamento" },
        ]} />
      </div>
      {aba === "equipe" && <Equipe />}
      {aba === "restaurante" && <Restaurante />}
      {aba === "mesas" && <Mesas />}
      {aba === "pagamentos" && <Formas />}
    </div>
  );
}

function Equipe() {
  const avisar = useAviso();
  const { perfil: eu } = useSessao();
  const { dados, carregando, recarregar } = useDados(() => q<Perfil[]>(supabase().from("perfis").select("*").order("ativo").order("nome")));
  async function mudar(p: Perfil, mud: Partial<Perfil>) {
    const { error } = await supabase().from("perfis").update(mud).eq("id", p.id);
    if (error) avisar(erroMsg(error), "erro"); else { avisar("Atualizado"); recarregar(); }
  }
  if (carregando) return <Carregando />;
  const pendentes = (dados ?? []).filter((p) => !p.ativo).length;
  return (
    <Cartao>
      <div className="p-4">
        <h2 className="font-bold">Usuários do sistema</h2>
        <p className="text-sm text-stone-500">
          Cada funcionário cria a própria conta na tela de login. Depois você escolhe o papel e libera o acesso aqui.
          {pendentes > 0 && <b className="text-brasa-700"> {pendentes} aguardando liberação.</b>}
        </p>
      </div>
      <Tabela cabecalho={["Nome", "Papel", "Acesso", "Desde"]}>
        {(dados ?? []).map((p) => (
          <tr key={p.id} className={!p.ativo ? "bg-mostarda-50" : ""}>
            <td className="px-4 py-3 font-semibold">{p.nome} {p.id === eu?.id && <Etiqueta tom="brasa">Você</Etiqueta>}</td>
            <td className="px-4 py-3">
              <Selecao value={p.papel} disabled={p.id === eu?.id} className="h-9 w-40" onChange={(e) => mudar(p, { papel: e.target.value as Papel })}>
                {(Object.keys(NOME_PAPEL) as Papel[]).map((k) => <option key={k} value={k}>{NOME_PAPEL[k]}</option>)}
              </Selecao>
            </td>
            <td className="px-4 py-3">
              {p.id === eu?.id ? <Etiqueta tom="verde">Liberado</Etiqueta> :
                <Chave ligado={p.ativo} onChange={(v) => mudar(p, { ativo: v })} rotulo={p.ativo ? "Liberado" : "Bloqueado"} />}
            </td>
            <td className="px-4 py-3 text-xs text-stone-500">{dataHora(p.created_at)}</td>
          </tr>
        ))}
      </Tabela>
      <div className="grid gap-2 border-t border-stone-100 p-4 text-xs text-stone-600 sm:grid-cols-2">
        <p><b>Gerente:</b> tudo, menos esta tela.</p>
        <p><b>Caixa:</b> comandas, recebimentos, caixa, fiado e descontos até o limite.</p>
        <p><b>Garçom:</b> abre comandas e lança pedidos. Não vê o caixa.</p>
        <p><b>Cozinha:</b> só o painel da cozinha.</p>
      </div>
    </Cartao>
  );
}

function Restaurante() {
  const avisar = useAviso();
  const { dados, carregando } = useDados(() => q<Configuracoes>(supabase().from("configuracoes").select("*").single()));
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [salvando, setSalvando] = useState(false);
  if (carregando) return <Carregando />;
  if (!dados) return <Vazio titulo="Configuração não encontrada" texto="Rode o arquivo supabase/seed.sql no banco." />;
  const v = f ?? {
    nome_fantasia: dados.nome_fantasia, razao_social: dados.razao_social ?? "", cnpj: dados.cnpj ?? "", telefone: dados.telefone ?? "",
    cidade: dados.cidade ?? "", uf: dados.uf ?? "",
    taxa: String(dados.taxa_servico_percentual).replace(".", ","), desconto: String(dados.desconto_maximo_percentual).replace(".", ","),
  };
  const set = (k: string, x: string) => setF({ ...v, [k]: x });
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase().from("configuracoes").update({
      nome_fantasia: v.nome_fantasia.trim(), razao_social: v.razao_social.trim() || null, cnpj: v.cnpj.trim() || null,
      telefone: v.telefone.trim() || null, cidade: v.cidade.trim() || null, uf: v.uf.trim().toUpperCase() || null,
      taxa_servico_percentual: parseValor(v.taxa), desconto_maximo_percentual: parseValor(v.desconto),
    }).eq("id", 1);
    setSalvando(false);
    if (error) avisar(erroMsg(error), "erro"); else avisar("Configurações salvas");
  }
  return (
    <Cartao className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do restaurante"><Entrada value={v.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} /></Campo>
        <Campo rotulo="Razão social"><Entrada value={v.razao_social} onChange={(e) => set("razao_social", e.target.value)} /></Campo>
        <Campo rotulo="CNPJ"><Entrada value={v.cnpj} onChange={(e) => set("cnpj", e.target.value)} /></Campo>
        <Campo rotulo="Telefone"><Entrada value={v.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><Entrada value={v.cidade} onChange={(e) => set("cidade", e.target.value)} /></Campo>
        <Campo rotulo="UF"><Entrada value={v.uf} maxLength={2} onChange={(e) => set("uf", e.target.value)} /></Campo>
        <Campo rotulo="Taxa de serviço (%)" dica="Cobrada nas mesas. O garçom pode tirar da conta se o cliente pedir.">
          <Entrada inputMode="decimal" value={v.taxa} onChange={(e) => set("taxa", e.target.value)} />
        </Campo>
        <Campo rotulo="Desconto máximo do caixa (%)" dica="Acima disso, só gerente ou dono.">
          <Entrada inputMode="decimal" value={v.desconto} onChange={(e) => set("desconto", e.target.value)} />
        </Campo>
      </div>
      <Botao onClick={salvar} carregando={salvando}><Save className="size-4" /> Salvar</Botao>
    </Cartao>
  );
}

function Mesas() {
  const avisar = useAviso();
  const { dados, carregando, recarregar } = useDados(() => q<Mesa[]>(supabase().from("mesas").select("*").order("numero")));
  const [ate, setAte] = useState("");
  if (carregando) return <Carregando />;
  const maior = Math.max(0, ...(dados ?? []).map((m) => m.numero));
  async function criar() {
    const n = Number(ate);
    if (!(n > maior)) return;
    const novas = Array.from({ length: n - maior }, (_, i) => ({ numero: maior + i + 1 }));
    const { error } = await supabase().from("mesas").insert(novas);
    if (error) avisar(erroMsg(error), "erro"); else { setAte(""); recarregar(); avisar(`${novas.length} mesa(s) criada(s)`); }
  }
  async function alternar(m: Mesa) {
    const { error } = await supabase().from("mesas").update({ ativa: !m.ativa }).eq("id", m.id);
    if (error) avisar(erroMsg(error), "erro"); else recarregar();
  }
  return (
    <Cartao className="p-5">
      <p className="mb-4 text-sm text-stone-600">Toque numa mesa para desativar (ela some do mapa). Hoje são {(dados ?? []).filter((m) => m.ativa).length} mesas ativas.</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {(dados ?? []).map((m) => (
          <button key={m.id} onClick={() => alternar(m)}
            className={m.ativa ? "h-12 rounded-xl border-2 border-brasa-200 bg-brasa-50 font-bold text-brasa-700" : "h-12 rounded-xl border-2 border-dashed border-stone-300 font-bold text-stone-400 line-through"}>
            {m.numero}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <Campo rotulo={`Criar mesas de ${maior + 1} até`}><Entrada type="number" min={maior + 1} value={ate} onChange={(e) => setAte(e.target.value)} className="w-32" /></Campo>
        <Botao onClick={criar} disabled={!(Number(ate) > maior)}><Plus className="size-4" /> Criar</Botao>
      </div>
    </Cartao>
  );
}

const TIPOS: Record<TipoForma, string> = {
  dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", vale_refeicao: "Vale refeição",
  vale_alimentacao: "Vale alimentação", fiado: "Fiado", outro: "Outro",
};

function Formas() {
  const avisar = useAviso();
  const { dados, carregando, recarregar } = useDados(() => q<FormaPagamento[]>(supabase().from("formas_pagamento").select("*").order("ordem")));
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoForma>("outro");
  if (carregando) return <Carregando />;
  async function alternar(f: FormaPagamento) {
    const { error } = await supabase().from("formas_pagamento").update({ ativa: !f.ativa }).eq("id", f.id);
    if (error) avisar(erroMsg(error), "erro"); else recarregar();
  }
  async function criar() {
    const { error } = await supabase().from("formas_pagamento").insert({ nome: nome.trim(), tipo, ordem: (dados?.length ?? 0) + 1 });
    if (error) avisar(erroMsg(error), "erro"); else { setNome(""); recarregar(); }
  }
  return (
    <Cartao className="p-5">
      <div className="space-y-2">
        {(dados ?? []).map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3">
            <span><b>{f.nome}</b> <span className="text-sm text-stone-500">· {TIPOS[f.tipo]}</span></span>
            <Chave ligado={f.ativa} onChange={() => alternar(f)} rotulo={f.ativa ? "Aparece no caixa" : "Oculta"} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 rounded-xl bg-brasa-50 p-3">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova forma (ex.: Sodexo)" className="min-w-48 flex-1" />
        <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoForma)} className="w-48">
          {(Object.keys(TIPOS) as TipoForma[]).filter((t) => t !== "fiado").map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
        </Selecao>
        <Botao disabled={!nome.trim()} onClick={criar}><Plus className="size-4" /> Adicionar</Botao>
      </div>
    </Cartao>
  );
}
