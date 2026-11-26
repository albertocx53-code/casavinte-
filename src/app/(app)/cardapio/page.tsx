"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Pause, Play, CheckCircle2, Flame, PauseCircle, Tags, Layers, ImageOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, useDados } from "@/lib/hooks";
import { brl, erroMsg, hojeISO, num, parseValor } from "@/lib/format";
import type { Adicional, Categoria, Produto, ProdutoAdicional, Setor, VwProdutosVendidos } from "@/lib/types";
import { Botao, Campo, Carregando, Cartao, Chave, Entrada, Etiqueta, Kpi, Modal, Pilulas, Selecao, Titulo, Vazio, cx, useAviso } from "@/components/ui";

const NOME_SETOR: Record<Setor, string> = { cozinha: "Cozinha", bar: "Bar", nenhum: "Não passa pela cozinha" };

export default function CardapioPage() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [categorias, produtos, adicionais, vinculos, vendidos] = await Promise.all([
      q<Categoria[]>(sb.from("categorias").select("*").order("ordem").order("nome")),
      q<Produto[]>(sb.from("produtos").select("*").order("ordem").order("nome")),
      q<Adicional[]>(sb.from("adicionais").select("*").order("nome")),
      q<ProdutoAdicional[]>(sb.from("produto_adicionais").select("*")),
      q<VwProdutosVendidos[]>(sb.from("vw_produtos_vendidos").select("produto_id,produto,quantidade").gte("dia", hojeISO(-30))),
    ]);
    return { categorias, produtos, adicionais, vinculos, vendidos };
  });

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [editando, setEditando] = useState<Produto | "novo" | null>(null);
  const [modal, setModal] = useState<null | "categorias" | "adicionais">(null);

  const maisVendido = useMemo(() => {
    const soma = new Map<string, { nome: string; qtd: number }>();
    for (const v of dados?.vendidos ?? []) {
      const a = soma.get(v.produto_id) ?? { nome: v.produto, qtd: 0 };
      a.qtd += Number(v.quantidade); soma.set(v.produto_id, a);
    }
    return [...soma.values()].sort((a, b) => b.qtd - a.qtd)[0] ?? null;
  }, [dados]);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Vazio titulo="Não foi possível carregar" texto={erro ?? undefined} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const { categorias, produtos, adicionais, vinculos } = dados;
  const ativos = produtos.filter((p) => p.ativo);
  const pausados = produtos.filter((p) => p.ativo && !p.disponivel);
  const termo = busca.trim().toLowerCase();
  const lista = produtos.filter((p) =>
    (filtro === "todos" || (filtro === "pausados" ? p.ativo && !p.disponivel : filtro === "inativos" ? !p.ativo : p.categoria_id === filtro)) &&
    (!termo || p.nome.toLowerCase().includes(termo) || p.codigo?.toLowerCase().includes(termo)));
  const nomeCat = (id: string) => categorias.find((c) => c.id === id)?.nome ?? "—";

  async function alternarDisponivel(p: Produto) {
    const { error } = await supabase().from("produtos").update({ disponivel: !p.disponivel }).eq("id", p.id);
    if (error) avisar(erroMsg(error), "erro");
    else { avisar(p.disponivel ? `${p.nome} pausado (esgotado)` : `${p.nome} voltou ao cardápio`); recarregar(); }
  }

  const editor = editando && (
    <EditorProduto key={editando === "novo" ? "novo" : editando.id}
      produto={editando === "novo" ? null : editando} categorias={categorias} adicionais={adicionais}
      vinculados={editando === "novo" ? [] : vinculos.filter((v) => v.produto_id === editando.id).map((v) => v.adicional_id)}
      categoriaPadrao={filtro !== "todos" && categorias.some((c) => c.id === filtro) ? filtro : categorias[0]?.id}
      aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); }} />
  );

  return (
    <div className="mx-auto max-w-7xl">
      <Titulo modulo="Retaguarda · Cardápio" sub="Pratos, bebidas, preços e adicionais. O que você muda aqui aparece na hora no PDV e no celular do garçom."
        acoes={<>
          <Botao variante="suave" onClick={() => setModal("categorias")}><Layers className="size-4" /> Categorias</Botao>
          <Botao variante="suave" onClick={() => setModal("adicionais")}><Tags className="size-4" /> Adicionais</Botao>
          <Botao onClick={() => setEditando("novo")} disabled={categorias.length === 0}><Plus className="size-4" /> Novo item</Botao>
        </>}>
        Gestão do cardápio
      </Titulo>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Itens ativos" valor={num(ativos.length)} tom="verde" icone={<CheckCircle2 />} rodape="Prontos para pedidos" />
        <Kpi rotulo="Mais vendido (30 dias)" valor={<span className="font-sans text-lg">{maisVendido?.nome ?? "—"}</span>} tom="mostarda" icone={<Flame />}
          rodape={maisVendido ? <span className="font-semibold text-mostarda-700">{num(maisVendido.qtd)} vendidos</span> : "Sem vendas ainda"} />
        <Kpi rotulo="Pausados" valor={num(pausados.length)} tom="vermelho" icone={<PauseCircle />} rodape="Esgotados no momento" />
      </div>

      <div className={cx("grid gap-5", editando && "lg:grid-cols-[1fr_420px]")}>
        <div className="min-w-0">
          <Cartao className="mb-4 space-y-3 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
              <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar prato, bebida ou código" className="pl-10" />
            </div>
            <Pilulas valor={filtro} onChange={setFiltro} opcoes={[
              { id: "todos", rotulo: "Todos", qtd: produtos.length },
              ...categorias.map((c) => ({ id: c.id, rotulo: c.nome, qtd: produtos.filter((p) => p.categoria_id === c.id).length })),
              ...(pausados.length ? [{ id: "pausados", rotulo: "Pausados", qtd: pausados.length, ponto: "vermelho" as const }] : []),
              ...(produtos.some((p) => !p.ativo) ? [{ id: "inativos", rotulo: "Fora do cardápio", qtd: produtos.filter((p) => !p.ativo).length }] : []),
            ]} />
          </Cartao>

          {lista.length === 0 ? (
            <Vazio titulo="Nenhum item aqui" texto={categorias.length === 0 ? "Crie uma categoria primeiro." : "Cadastre um item novo."}
              acao={categorias.length === 0 ? <Botao onClick={() => setModal("categorias")}>Criar categoria</Botao> : <Botao onClick={() => setEditando("novo")}>Novo item</Botao>} />
          ) : (
            <div className="space-y-3">
              {lista.map((p) => {
                const sel = editando !== "novo" && editando?.id === p.id;
                const margem = p.custo && Number(p.preco) > 0 ? ((Number(p.preco) - Number(p.custo)) / Number(p.preco)) * 100 : null;
                const nAd = vinculos.filter((v) => v.produto_id === p.id).length;
                return (
                  <Cartao key={p.id} className={cx("flex gap-3 p-3 transition-shadow", sel && "ring-2 ring-brasa-500", !p.ativo && "opacity-60")}>
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-brasa-50 sm:size-24">
                      {p.imagem_url
                        ? <img src={p.imagem_url} alt="" className={cx("size-full object-cover", !p.disponivel && "grayscale")} />
                        : <div className="flex size-full items-center justify-center text-brasa-200"><ImageOff className="size-7" /></div>}
                      {p.codigo && <span className="absolute left-1 top-1 rounded bg-carvao-900/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-mostarda-400">#{p.codigo}</span>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 font-bold text-stone-900">
                            {p.nome}
                            {!p.ativo ? <Etiqueta>Fora do cardápio</Etiqueta> : p.disponivel ? <Etiqueta tom="verde">● Ativo</Etiqueta> : <Etiqueta tom="vermelho">● Pausado</Etiqueta>}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-500">{nomeCat(p.categoria_id)}{nAd ? ` · ${nAd} adicional(is)` : ""}{p.unidade === "KG" ? " · vendido por kg" : ""}</p>
                          {p.descricao && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{p.descricao}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="valor text-lg font-bold text-brasa-700">{brl(p.preco)}{p.unidade === "KG" && <span className="text-xs">/kg</span>}</p>
                          {p.custo != null && <p className="font-mono text-[11px] text-stone-500">Custo {brl(p.custo)}</p>}
                          {margem != null && <p className={cx("font-mono text-[11px] font-semibold", margem < 50 ? "text-brasa-600" : "text-emerald-700")}>Margem {num(margem)}%</p>}
                        </div>
                      </div>
                      <div className="mt-auto flex justify-end gap-2 pt-2">
                        {p.ativo && (
                          p.disponivel
                            ? <Botao tamanho="sm" variante="secundario" onClick={() => alternarDisponivel(p)}><Pause className="size-3.5" /> Pausar</Botao>
                            : <Botao tamanho="sm" variante="sucesso" onClick={() => alternarDisponivel(p)}><Play className="size-3.5" /> Reativar</Botao>
                        )}
                        <Botao tamanho="sm" variante="suave" onClick={() => setEditando(p)}><Pencil className="size-3.5" /> Editar</Botao>
                      </div>
                    </div>
                  </Cartao>
                );
              })}
            </div>
          )}
        </div>

        {editando && (
          <>
            <div className="hidden lg:block"><div className="sticky top-20">{editor}</div></div>
            <div className="lg:hidden">
              <Modal aberto aoFechar={() => setEditando(null)} titulo={editando === "novo" ? "Novo item" : "Editar item"} largura="lg">{editor}</Modal>
            </div>
          </>
        )}
      </div>

      {modal === "categorias" && <CategoriasModal categorias={categorias} aoFechar={() => setModal(null)} aoMudar={recarregar} />}
      {modal === "adicionais" && <AdicionaisModal adicionais={adicionais} aoFechar={() => setModal(null)} aoMudar={recarregar} />}
    </div>
  );
}

// ------------------------------------------------------------------ Editor
function EditorProduto({ produto, categorias, adicionais, vinculados, categoriaPadrao, aoFechar, aoSalvar }: {
  produto: Produto | null; categorias: Categoria[]; adicionais: Adicional[]; vinculados: string[]; categoriaPadrao?: string;
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const avisar = useAviso();
  const [f, setF] = useState({
    nome: produto?.nome ?? "",
    codigo: produto?.codigo ?? "",
    categoria_id: produto?.categoria_id ?? categoriaPadrao ?? "",
    preco: produto ? String(produto.preco).replace(".", ",") : "",
    custo: produto?.custo != null ? String(produto.custo).replace(".", ",") : "",
    unidade: produto?.unidade ?? "UN",
    setor: produto?.setor ?? "",
    descricao: produto?.descricao ?? "",
    imagem_url: produto?.imagem_url ?? "",
    ativo: produto?.ativo ?? true,
    disponivel: produto?.disponivel ?? true,
  });
  const [sel, setSel] = useState<string[]>(vinculados);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const preco = parseValor(f.preco);
  const custo = f.custo ? parseValor(f.custo) : null;
  const margem = custo != null && preco > 0 ? ((preco - custo) / preco) * 100 : null;
  const valido = f.nome.trim() && f.categoria_id && Number.isFinite(preco) && preco >= 0 && (custo == null || Number.isFinite(custo));

  async function salvar() {
    setSalvando(true);
    try {
      const sb = supabase();
      const reg = {
        nome: f.nome.trim(), codigo: f.codigo.trim() || null, categoria_id: f.categoria_id, preco, custo,
        unidade: f.unidade, setor: f.setor || null, descricao: f.descricao.trim() || null,
        imagem_url: f.imagem_url.trim() || null, ativo: f.ativo, disponivel: f.disponivel,
      };
      const salvo = produto
        ? await q<Produto>(sb.from("produtos").update(reg).eq("id", produto.id).select().single())
        : await q<Produto>(sb.from("produtos").insert(reg).select().single());
      const tirar = vinculados.filter((id) => !sel.includes(id));
      const por = sel.filter((id) => !vinculados.includes(id));
      if (tirar.length) await q(sb.from("produto_adicionais").delete().eq("produto_id", salvo.id).in("adicional_id", tirar));
      if (por.length) await q(sb.from("produto_adicionais").insert(por.map((adicional_id) => ({ produto_id: salvo.id, adicional_id }))));
      avisar(produto ? "Item atualizado" : "Item criado");
      aoSalvar();
    } catch (e) {
      const m = erroMsg(e);
      avisar(m.includes("produtos_codigo_key") ? "Já existe um item com esse código." : m, "erro");
      setSalvando(false);
    }
  }

  return (
    <Cartao className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-brasa-100 bg-brasa-50/60 px-4 py-3">
        <div>
          <p className="font-bold">{produto ? "Editar item" : "Novo item"}</p>
          {produto?.codigo && <p className="font-mono text-xs text-stone-500">Código #{produto.codigo}</p>}
        </div>
        {produto && <Etiqueta tom="brasa">Editando</Etiqueta>}
      </div>
      <div className="space-y-4 p-4">
        <div className="overflow-hidden rounded-xl bg-brasa-50">
          {f.imagem_url ? <img src={f.imagem_url} alt="" className="h-40 w-full object-cover" />
            : <div className="flex h-28 items-center justify-center text-sm text-brasa-200"><ImageOff className="mr-2 size-5" /> Sem foto</div>}
        </div>
        <Campo rotulo="Link da foto (opcional)" dica="Cole o endereço de uma imagem. Ex.: foto salva no Google Drive público ou Imgur.">
          <Entrada value={f.imagem_url} onChange={(e) => set("imagem_url", e.target.value)} placeholder="https://..." />
        </Campo>
        <Campo rotulo="Nome do item"><Entrada value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Categoria">
            <Selecao value={f.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Código (atalho no PDV)"><Entrada value={f.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} placeholder="EXE01" /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={f.unidade === "KG" ? "Preço do kg (R$)" : "Preço de venda (R$)"}>
            <Entrada inputMode="decimal" value={f.preco} onChange={(e) => set("preco", e.target.value)} className="valor" />
          </Campo>
          <Campo rotulo="Custo (R$)" dica="Opcional, para ver a margem">
            <Entrada inputMode="decimal" value={f.custo} onChange={(e) => set("custo", e.target.value)} className="valor" />
          </Campo>
        </div>
        {margem != null && Number.isFinite(margem) && (
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
            <span className="text-stone-600">Margem bruta</span>
            <span className={cx("rounded-md px-2 py-0.5 font-mono font-bold", margem < 50 ? "bg-brasa-100 text-brasa-700" : "bg-emerald-100 text-emerald-800")}>{num(margem)}%</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Vendido por">
            <Selecao value={f.unidade} onChange={(e) => set("unidade", e.target.value as "UN" | "KG")}>
              <option value="UN">Unidade</option><option value="KG">Quilo (kg)</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Vai para">
            <Selecao value={f.setor} onChange={(e) => set("setor", e.target.value as Setor | "")}>
              <option value="">Padrão da categoria</option>
              {(["cozinha", "bar", "nenhum"] as Setor[]).map((s) => <option key={s} value={s}>{NOME_SETOR[s]}</option>)}
            </Selecao>
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3}
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px] focus:border-brasa-500 focus:outline-none focus:ring-3 focus:ring-brasa-500/20" />
        </Campo>
        <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Exibição</p>
          <Chave ligado={f.ativo} onChange={(v) => set("ativo", v)} rotulo="Aparece no cardápio do PDV e do garçom" />
          <Chave ligado={f.disponivel} onChange={(v) => set("disponivel", v)} rotulo="Disponível (desligue quando esgotar)" />
        </div>
        {adicionais.length > 0 && (
          <div className="space-y-2 rounded-xl border border-stone-200 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Adicionais permitidos</p>
            {adicionais.filter((a) => a.ativo).map((a) => (
              <label key={a.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-brasa-600" checked={sel.includes(a.id)}
                    onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />
                  {a.nome}
                </span>
                <span className="font-mono text-xs text-stone-500">+{brl(a.preco)}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-stone-100 p-4">
        <Botao variante="secundario" className="flex-1" onClick={aoFechar}>Cancelar</Botao>
        <Botao className="flex-1" disabled={!valido} carregando={salvando} onClick={salvar}>Salvar</Botao>
      </div>
    </Cartao>
  );
}

// ------------------------------------------------------------------ Categorias
function CategoriasModal({ categorias, aoFechar, aoMudar }: { categorias: Categoria[]; aoFechar: () => void; aoMudar: () => void }) {
  const avisar = useAviso();
  const [nova, setNova] = useState("");
  const [setor, setSetor] = useState<Setor>("cozinha");

  async function criar() {
    const { error } = await supabase().from("categorias").insert({ nome: nova.trim(), setor, ordem: categorias.length + 1 });
    if (error) avisar(erroMsg(error), "erro"); else { setNova(""); aoMudar(); }
  }
  async function atualizar(c: Categoria, mud: Partial<Categoria>) {
    const { error } = await supabase().from("categorias").update(mud).eq("id", c.id);
    if (error) avisar(erroMsg(error), "erro"); else aoMudar();
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Categorias" largura="lg">
      <div className="space-y-2">
        {categorias.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 p-2">
            <Entrada defaultValue={c.nome} className="h-10 min-w-40 flex-1"
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && atualizar(c, { nome: e.target.value.trim() })} />
            <Entrada type="number" defaultValue={c.ordem} className="h-10 w-20" aria-label="Ordem"
              onBlur={(e) => Number(e.target.value) !== c.ordem && atualizar(c, { ordem: Number(e.target.value) })} />
            <Selecao value={c.setor} className="h-10 w-48" onChange={(e) => atualizar(c, { setor: e.target.value as Setor })}>
              {(["cozinha", "bar", "nenhum"] as Setor[]).map((s) => <option key={s} value={s}>{NOME_SETOR[s]}</option>)}
            </Selecao>
            <Chave ligado={c.ativa} onChange={(v) => atualizar(c, { ativa: v })} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-brasa-50 p-3">
        <Entrada value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova categoria" className="min-w-40 flex-1" />
        <Selecao value={setor} onChange={(e) => setSetor(e.target.value as Setor)} className="w-48">
          {(["cozinha", "bar", "nenhum"] as Setor[]).map((s) => <option key={s} value={s}>{NOME_SETOR[s]}</option>)}
        </Selecao>
        <Botao disabled={!nova.trim()} onClick={criar}><Plus className="size-4" /> Criar</Botao>
      </div>
      <p className="mt-2 text-xs text-stone-500">&quot;Vai para&quot; define em qual painel o pedido aparece. Bebidas normalmente não passam pela cozinha.</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ Adicionais
function AdicionaisModal({ adicionais, aoFechar, aoMudar }: { adicionais: Adicional[]; aoFechar: () => void; aoMudar: () => void }) {
  const avisar = useAviso();
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  async function criar() {
    const { error } = await supabase().from("adicionais").insert({ nome: nome.trim(), preco: parseValor(preco || "0") });
    if (error) avisar(erroMsg(error), "erro"); else { setNome(""); setPreco(""); aoMudar(); }
  }
  async function atualizar(a: Adicional, mud: Partial<Adicional>) {
    const { error } = await supabase().from("adicionais").update(mud).eq("id", a.id);
    if (error) avisar(erroMsg(error), "erro"); else aoMudar();
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo="Adicionais" largura="lg">
      <p className="mb-3 text-sm text-stone-600">Extras como &quot;Ovo frito&quot; ou &quot;Bacon&quot;. Depois marque em cada prato quais adicionais ele aceita.</p>
      <div className="space-y-2">
        {adicionais.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-xl border border-stone-200 p-2">
            <Entrada defaultValue={a.nome} className="h-10 flex-1"
              onBlur={(e) => e.target.value.trim() && e.target.value !== a.nome && atualizar(a, { nome: e.target.value.trim() })} />
            <Entrada defaultValue={String(a.preco).replace(".", ",")} inputMode="decimal" className="valor h-10 w-28"
              onBlur={(e) => { const v = parseValor(e.target.value); if (Number.isFinite(v) && v !== Number(a.preco)) atualizar(a, { preco: v }); }} />
            <Chave ligado={a.ativo} onChange={(v) => atualizar(a, { ativo: v })} />
          </div>
        ))}
        {adicionais.length === 0 && <p className="text-sm text-stone-500">Nenhum adicional ainda.</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-brasa-50 p-3">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Ovo frito)" className="min-w-40 flex-1" />
        <Entrada value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Preço" inputMode="decimal" className="valor w-28" />
        <Botao disabled={!nome.trim()} onClick={criar}><Plus className="size-4" /> Criar</Botao>
      </div>
    </Modal>
  );
}
