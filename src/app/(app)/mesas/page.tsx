"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, ShoppingBag, Bike, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados, useTempoReal, useAgora } from "@/lib/hooks";
import { brl, tempo, minutosDesde, NOME_TIPO, erroMsg } from "@/lib/format";
import type { Cliente, Pedido, TipoPedido, VwMesa, VwPedidoAberto } from "@/lib/types";
import { Botao, Campo, Carregando, Cartao, Entrada, Etiqueta, Modal, Selecao, Titulo, Vazio, cx, useAviso } from "@/components/ui";

export default function MesasPage() {
  const router = useRouter();
  const avisar = useAviso();
  const agora = useAgora();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [mesas, pedidos] = await Promise.all([
      q<VwMesa[]>(sb.from("vw_mesas").select("*").order("numero")),
      q<VwPedidoAberto[]>(sb.from("vw_pedidos_abertos").select("*").neq("tipo", "mesa").order("aberto_em")),
    ]);
    return { mesas, pedidos };
  });
  useTempoReal(["pedidos", "pedido_itens"], recarregar);

  const [novo, setNovo] = useState<TipoPedido | null>(null);
  const [abrindoMesa, setAbrindoMesa] = useState<VwMesa | null>(null);

  if (carregando) return <Carregando />;
  if (erro) return <Vazio titulo="Não foi possível carregar" texto={erro} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const mesas = dados?.mesas ?? [];
  const pedidos = dados?.pedidos ?? [];
  const ocupadas = mesas.filter((m) => m.ocupada).length;

  return (
    <div className="mx-auto max-w-6xl">
      <Titulo modulo="Operação & Salão · Comandas" sub={`${ocupadas} de ${mesas.length} mesas ocupadas · ${pedidos.length} pedidos de balcão e entrega abertos`}
        acoes={<>
          <Botao variante="suave" onClick={() => setNovo("balcao")}><ShoppingBag className="size-4" /> Balcão</Botao>
          <Botao onClick={() => setNovo("delivery")}><Bike className="size-4" /> Delivery / App</Botao>
        </>}>
        Mesas e comandas
      </Titulo>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {mesas.map((m) => {
          const min = m.aberto_em ? minutosDesde(m.aberto_em, agora) : 0;
          const demorada = m.ocupada && min >= 120;
          return (
            <button key={m.mesa_id}
              onClick={() => (m.pedido_id ? router.push(`/comanda/${m.pedido_id}`) : setAbrindoMesa(m))}
              className={cx("relative flex aspect-[6/5] flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition-all active:scale-[0.97]",
                m.ocupada
                  ? demorada ? "border-mostarda-400 bg-mostarda-50" : "border-brasa-500 bg-brasa-50"
                  : "border-stone-200 bg-white hover:border-stone-300")}>
              <span className={cx("valor text-3xl font-bold", m.ocupada ? "text-brasa-700" : "text-stone-400")}>{m.numero}</span>
              {m.ocupada ? (
                <>
                  <span className="mt-1 text-sm font-semibold text-stone-800 tabular">{brl(m.total)}</span>
                  <span className={cx("mt-0.5 inline-flex items-center gap-1 text-xs tabular", demorada ? "font-semibold text-mostarda-700" : "text-stone-500")}>
                    {demorada ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}{tempo(min)}
                  </span>
                </>
              ) : (
                <span className="mt-1 text-xs font-medium text-stone-400">Livre</span>
              )}
              {m.pessoas ? (
                <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 text-[11px] text-stone-500">
                  <Users className="size-3" />{m.pessoas}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {mesas.length === 0 && <Vazio titulo="Nenhuma mesa cadastrada" texto="Cadastre as mesas em Configurações." />}

      <h2 className="mb-3 mt-8 text-lg font-bold">Balcão, delivery e apps</h2>
      {pedidos.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhum pedido aberto.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pedidos.map((p) => {
            const min = minutosDesde(p.aberto_em, agora);
            return (
              <Cartao key={p.id} className="cursor-pointer p-4 transition-shadow hover:shadow-md">
                <button className="w-full text-left" onClick={() => router.push(`/comanda/${p.id}`)}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tabular">#{p.numero}</span>
                    <Etiqueta tom={p.tipo === "balcao" ? "neutro" : p.tipo === "delivery" ? "azul" : "vermelho"}>{NOME_TIPO[p.tipo]}</Etiqueta>
                  </div>
                  <p className="mt-1 truncate text-stone-700">{p.cliente ?? "Sem nome"}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold tabular">{brl(p.total)}</span>
                    <span className={cx("inline-flex items-center gap-1 tabular", min >= 60 ? "text-amber-700" : "text-stone-500")}>
                      <Clock className="size-3.5" />{tempo(min)}
                    </span>
                  </div>
                </button>
              </Cartao>
            );
          })}
        </div>
      )}

      {abrindoMesa && (
        <AbrirMesa mesa={abrindoMesa} aoFechar={() => setAbrindoMesa(null)}
          aoAbrir={(id) => { setAbrindoMesa(null); router.push(`/comanda/${id}`); }}
          aoErro={(e) => avisar(e, "erro")} />
      )}
      {novo && (
        <NovoPedido tipoInicial={novo} aoFechar={() => setNovo(null)}
          aoAbrir={(id) => { setNovo(null); router.push(`/comanda/${id}`); }}
          aoErro={(e) => avisar(e, "erro")} />
      )}
    </div>
  );
}

function AbrirMesa({ mesa, aoFechar, aoAbrir, aoErro }: { mesa: VwMesa; aoFechar: () => void; aoAbrir: (id: string) => void; aoErro: (e: string) => void }) {
  const [pessoas, setPessoas] = useState(2);
  const [enviando, setEnviando] = useState(false);
  async function abrir() {
    setEnviando(true);
    try {
      const p = await rpc<Pedido>("abrir_pedido", { p_tipo: "mesa", p_mesa_id: mesa.mesa_id, p_pessoas: pessoas });
      aoAbrir(p.id);
    } catch (e) { aoErro(erroMsg(e)); setEnviando(false); }
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Abrir mesa ${mesa.numero}`} largura="sm"
      rodape={<><Botao variante="secundario" onClick={aoFechar} className="flex-1">Voltar</Botao>
        <Botao onClick={abrir} carregando={enviando} className="flex-1">Abrir comanda</Botao></>}>
      <p className="mb-3 text-sm text-stone-600">Quantas pessoas?</p>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
          <button key={n} onClick={() => setPessoas(n)}
            className={cx("h-12 rounded-xl border-2 text-lg font-bold tabular",
              pessoas === n ? "border-brasa-500 bg-brasa-50 text-brasa-700" : "border-stone-200 text-stone-700")}>
            {n}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function NovoPedido({ tipoInicial, aoFechar, aoAbrir, aoErro }: {
  tipoInicial: TipoPedido; aoFechar: () => void; aoAbrir: (id: string) => void; aoErro: (e: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoPedido>(tipoInicial);
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { dados: clientes } = useDados(() =>
    q<Cliente[]>(supabase().from("clientes").select("id,nome,telefone").eq("ativo", true).order("nome")));

  const tipos: TipoPedido[] = tipoInicial === "balcao" ? ["balcao"] : ["delivery", "ifood", "99food"];

  async function abrir() {
    setEnviando(true);
    try {
      const p = await rpc<Pedido>("abrir_pedido", {
        p_tipo: tipo,
        p_cliente_id: clienteId || null,
        p_nome_cliente: nome.trim() || null,
        p_observacoes: obs.trim() || null,
        p_codigo_externo: codigo.trim() || null,
      });
      aoAbrir(p.id);
    } catch (e) { aoErro(erroMsg(e)); setEnviando(false); }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={tipoInicial === "balcao" ? "Novo pedido de balcão" : "Novo pedido para entrega"}
      rodape={<><Botao variante="secundario" onClick={aoFechar} className="flex-1">Voltar</Botao>
        <Botao onClick={abrir} carregando={enviando} className="flex-1"><Plus className="size-4" /> Abrir pedido</Botao></>}>
      <div className="space-y-4">
        {tipos.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {tipos.map((t) => (
              <button key={t} onClick={() => setTipo(t)}
                className={cx("h-11 rounded-xl border-2 font-semibold",
                  tipo === t ? "border-brasa-500 bg-brasa-50 text-brasa-700" : "border-stone-200 text-stone-700")}>
                {NOME_TIPO[t]}
              </button>
            ))}
          </div>
        )}
        <Campo rotulo="Cliente cadastrado (opcional)" dica="Necessário para vender no fiado.">
          <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">—</option>
            {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.telefone ? ` · ${c.telefone}` : ""}</option>)}
          </Selecao>
        </Campo>
        {!clienteId && (
          <Campo rotulo="Nome para chamar">
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria" />
          </Campo>
        )}
        {(tipo === "ifood" || tipo === "99food") && (
          <Campo rotulo={`Código do pedido no ${NOME_TIPO[tipo]}`}>
            <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Campo>
        )}
        {tipo === "delivery" && (
          <Campo rotulo="Endereço / observações">
            <Entrada value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Rua, número, referência" />
          </Campo>
        )}
      </div>
    </Modal>
  );
}
