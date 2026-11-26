"use client";

import { useState } from "react";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Banknote, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { q, rpc, useDados } from "@/lib/hooks";
import { brl, dataHora, erroMsg, parseValor } from "@/lib/format";
import type { VwResumoCaixa } from "@/lib/types";
import { Botao, Campo, Carregando, Cartao, Entrada, Etiqueta, Kpi, Modal, Tabela, Titulo, Vazio, cx, useAviso } from "@/components/ui";

export default function CaixaPage() {
  const avisar = useAviso();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const sb = supabase();
    const [caixas, abertas] = await Promise.all([
      q<VwResumoCaixa[]>(sb.from("vw_resumo_caixas").select("*").order("aberto_em", { ascending: false }).limit(15)),
      sb.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "aberto"),
    ]);
    return { caixas, comandasAbertas: abertas.count ?? 0 };
  });
  const [modal, setModal] = useState<null | "abrir" | "sangria" | "suprimento" | "fechar">(null);
  const [resultado, setResultado] = useState<VwResumoCaixa | null>(null);

  if (carregando) return <Carregando />;
  if (erro) return <Vazio titulo="Não foi possível carregar" texto={erro} acao={<Botao onClick={recarregar}>Tentar de novo</Botao>} />;

  const atual = dados?.caixas.find((c) => c.status === "aberto") ?? null;
  const historico = dados?.caixas.filter((c) => c.status === "fechado") ?? [];
  const formas = atual ? Object.entries(atual.vendas_por_forma).sort((a, b) => b[1] - a[1]) : [];
  const totalFormas = formas.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Titulo modulo="Operação & Salão · PDV - Caixa"
        sub={atual ? `Aberto por ${atual.aberto_por} em ${dataHora(atual.aberto_em)}` : "Nenhum caixa aberto. Abra o caixa para começar a receber."}
        acoes={atual ? <>
          <Botao variante="suave" onClick={() => setModal("suprimento")}><ArrowDownCircle className="size-4" /> Suprimento</Botao>
          <Botao variante="suave" onClick={() => setModal("sangria")}><ArrowUpCircle className="size-4" /> Sangria</Botao>
          <Botao onClick={() => setModal("fechar")}><Lock className="size-4" /> Fechar caixa</Botao>
        </> : <Botao onClick={() => setModal("abrir")}><Unlock className="size-4" /> Abrir caixa</Botao>}>
        Caixa {atual ? <Etiqueta tom="verde" className="ml-2 align-middle">ABERTO</Etiqueta> : <Etiqueta className="ml-2 align-middle">FECHADO</Etiqueta>}
      </Titulo>

      {atual ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Vendas neste caixa" valor={brl(atual.total_vendas)} tom="verde" icone={<Wallet />}
              rodape={`${formas.length} forma(s) de pagamento`} />
            <Kpi rotulo="Dinheiro na gaveta" valor={brl(atual.dinheiro_esperado)} tom="mostarda" icone={<Banknote />}
              rodape={`Abertura ${brl(atual.valor_abertura)}`} />
            <Kpi rotulo="Sangrias" valor={brl(atual.sangrias)} tom="vermelho" icone={<ArrowUpCircle />}
              rodape={`Suprimentos ${brl(atual.suprimentos)}`} />
            <Kpi rotulo="Fiado recebido" valor={brl(atual.fiado_recebido)} icone={<ArrowDownCircle />}
              rodape={atual.despesas_pagas_no_caixa ? `Despesas pagas: ${brl(atual.despesas_pagas_no_caixa)}` : "Clientes quitando a conta"} />
          </div>

          {(dados?.comandasAbertas ?? 0) > 0 && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-mostarda-100 px-4 py-3 text-sm font-medium text-mostarda-700">
              <AlertTriangle className="size-4" /> {dados!.comandasAbertas} comanda(s) ainda aberta(s). Confira antes de fechar o caixa.
            </p>
          )}

          <Cartao className="mt-5 p-5">
            <h2 className="mb-4 font-bold">Formas de pagamento</h2>
            {formas.length === 0 ? <p className="text-sm text-stone-500">Nenhuma venda recebida ainda.</p> : (
              <div className="space-y-3">
                {formas.map(([nome, valor]) => (
                  <div key={nome}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{nome}</span>
                      <span className="tabular text-stone-600">{Math.round((valor / totalFormas) * 100)}% · <b className="text-stone-900">{brl(valor)}</b></span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brasa-50">
                      <div className="h-full rounded-full bg-brasa-600" style={{ width: `${(valor / totalFormas) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Cartao>
        </>
      ) : (
        <Vazio icone={<Wallet className="size-10" />} titulo="Caixa fechado"
          texto="Informe quanto dinheiro tem na gaveta para começar o dia."
          acao={<Botao onClick={() => setModal("abrir")}><Unlock className="size-4" /> Abrir caixa</Botao>} />
      )}

      {historico.length > 0 && (
        <Cartao className="mt-6">
          <h2 className="px-4 pt-4 font-bold">Últimos fechamentos</h2>
          <Tabela cabecalho={["Fechado em", "Quem fechou", "Vendas", "Esperado", "Contado", "Diferença"]}>
            {historico.map((c) => (
              <tr key={c.caixa_id}>
                <td className="whitespace-nowrap px-4 py-3">{c.fechado_em && dataHora(c.fechado_em)}</td>
                <td className="px-4 py-3">{c.fechado_por}</td>
                <td className="px-4 py-3 tabular">{brl(c.total_vendas)}</td>
                <td className="px-4 py-3 tabular">{brl(c.dinheiro_esperado)}</td>
                <td className="px-4 py-3 tabular">{brl(c.dinheiro_informado)}</td>
                <td className={cx("px-4 py-3 font-semibold tabular", Number(c.diferenca) < 0 ? "text-brasa-600" : Number(c.diferenca) > 0 ? "text-mostarda-700" : "text-emerald-700")}>
                  {Number(c.diferenca) === 0 ? "Bateu" : brl(c.diferenca)}
                </td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}

      {modal === "abrir" && (
        <ValorModal titulo="Abrir caixa" rotulo="Dinheiro na gaveta (troco inicial)" botao="Abrir caixa" aoFechar={() => setModal(null)}
          aoConfirmar={async (v) => { await rpc("abrir_caixa", { p_valor_abertura: v }); avisar("Caixa aberto"); setModal(null); recarregar(); }} />
      )}
      {(modal === "sangria" || modal === "suprimento") && (
        <ValorModal titulo={modal === "sangria" ? "Sangria (retirar dinheiro)" : "Suprimento (colocar troco)"} rotulo="Valor" comMotivo
          botao="Registrar" aoFechar={() => setModal(null)}
          aoConfirmar={async (v, motivo) => {
            await rpc("registrar_movimento_caixa", { p_tipo: modal, p_valor: v, p_motivo: motivo });
            avisar("Registrado"); setModal(null); recarregar();
          }} />
      )}
      {modal === "fechar" && atual && (
        <ValorModal titulo="Fechar caixa" rotulo="Quanto dinheiro você contou na gaveta?" botao="Fechar caixa"
          dica="Conte as notas e moedas antes. O sistema compara com o valor esperado."
          aoFechar={() => setModal(null)}
          aoConfirmar={async (v) => {
            await rpc("fechar_caixa", { p_dinheiro_informado: v });
            const r = await q<VwResumoCaixa>(supabase().from("vw_resumo_caixas").select("*").eq("caixa_id", atual.caixa_id).single());
            setModal(null); setResultado(r); recarregar();
          }} />
      )}
      {resultado && (
        <Modal aberto aoFechar={() => setResultado(null)} titulo="Caixa fechado" largura="sm"
          rodape={<Botao className="w-full" onClick={() => setResultado(null)}>Ok</Botao>}>
          <div className="space-y-2 text-sm">
            <Linha r="Total vendido" v={brl(resultado.total_vendas)} />
            <Linha r="Dinheiro esperado" v={brl(resultado.dinheiro_esperado)} />
            <Linha r="Dinheiro contado" v={brl(resultado.dinheiro_informado)} />
            <div className={cx("mt-3 rounded-xl px-4 py-3 text-center text-lg font-bold",
              Number(resultado.diferenca) === 0 ? "bg-emerald-50 text-emerald-800" : Number(resultado.diferenca) < 0 ? "bg-brasa-50 text-brasa-700" : "bg-mostarda-100 text-mostarda-700")}>
              {Number(resultado.diferenca) === 0 ? "O caixa bateu!" : Number(resultado.diferenca) < 0 ? `Faltou ${brl(-Number(resultado.diferenca))}` : `Sobrou ${brl(resultado.diferenca)}`}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Linha({ r, v }: { r: string; v: string }) {
  return <div className="flex justify-between"><span className="text-stone-600">{r}</span><span className="font-semibold tabular">{v}</span></div>;
}

function ValorModal({ titulo, rotulo, botao, dica, comMotivo, aoFechar, aoConfirmar }: {
  titulo: string; rotulo: string; botao: string; dica?: string; comMotivo?: boolean;
  aoFechar: () => void; aoConfirmar: (valor: number, motivo: string) => Promise<void>;
}) {
  const avisar = useAviso();
  const [v, setV] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const valor = parseValor(v || "0");
  const valido = Number.isFinite(valor) && valor >= 0 && (!comMotivo || (valor > 0 && motivo.trim()));
  async function ok() {
    setEnviando(true);
    try { await aoConfirmar(valor, motivo.trim()); } catch (e) { avisar(erroMsg(e), "erro"); setEnviando(false); }
  }
  return (
    <Modal aberto aoFechar={aoFechar} titulo={titulo} largura="sm"
      rodape={<><Botao variante="secundario" className="flex-1" onClick={aoFechar}>Voltar</Botao>
        <Botao className="flex-1" disabled={!valido} carregando={enviando} onClick={ok}>{botao}</Botao></>}>
      <div className="space-y-4">
        <Campo rotulo={rotulo} dica={dica}>
          <Entrada autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" className="valor text-xl" />
        </Campo>
        {comMotivo && (
          <Campo rotulo="Motivo">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: depósito no banco, troco" />
          </Campo>
        )}
      </div>
    </Modal>
  );
}
