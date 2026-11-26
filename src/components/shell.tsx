"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  LayoutDashboard, Grid3x3, ChefHat, Wallet, BookOpen, HandCoins, Receipt, BarChart3, Settings, LogOut,
  MoreHorizontal, Clock, ClipboardList, Bell, Headset,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useSessao, INICIO } from "@/lib/sessao";
import { useDados, useTempoReal } from "@/lib/hooks";
import type { Papel } from "@/lib/types";
import { NOME_PAPEL } from "@/lib/format";
import { Botao, Carregando, cx } from "./ui";

type Secao = "operacao" | "retaguarda";
type Item = { href: string; rotulo: string; curto?: string; icone: typeof Grid3x3; papeis: Papel[]; secao: Secao };
export const MENU: Item[] = [
  { href: "/mesas",         rotulo: "Comandas",        icone: Grid3x3,         papeis: ["dono", "gerente", "caixa", "garcom"], secao: "operacao" },
  { href: "/caixa",         rotulo: "PDV - Caixa",     curto: "Caixa", icone: Wallet,          papeis: ["dono", "gerente", "caixa"], secao: "operacao" },
  { href: "/cozinha",       rotulo: "Painel KDS",      curto: "Cozinha", icone: ChefHat,         papeis: ["dono", "gerente", "caixa", "garcom", "cozinha"], secao: "operacao" },
  { href: "/painel",        rotulo: "Painel do dia",   curto: "Painel", icone: LayoutDashboard, papeis: ["dono", "gerente"], secao: "retaguarda" },
  { href: "/cardapio",      rotulo: "Cardápio",        icone: BookOpen,        papeis: ["dono", "gerente"], secao: "retaguarda" },
  { href: "/fiado",         rotulo: "Clientes & Fiado", curto: "Fiado", icone: HandCoins,      papeis: ["dono", "gerente", "caixa"], secao: "retaguarda" },
  { href: "/contas",        rotulo: "Contas a pagar",  icone: Receipt,         papeis: ["dono", "gerente"], secao: "retaguarda" },
  { href: "/relatorios",    rotulo: "Relatórios",      icone: BarChart3,       papeis: ["dono", "gerente"], secao: "retaguarda" },
  { href: "/configuracoes", rotulo: "Configurações",   icone: Settings,        papeis: ["dono"], secao: "retaguarda" },
];
const ROTA_BASE: Record<string, string> = { "/comanda": "/mesas" };

function rotaPermitida(path: string, papel: Papel) {
  const base = "/" + (path.split("/")[1] ?? "");
  const efetiva = ROTA_BASE[base] ?? base;
  const item = MENU.find((m) => m.href === efetiva);
  return !item || item.papeis.includes(papel);
}

/** Contadores que aparecem no topo e na barra lateral. */
function useResumo(ativo: boolean) {
  const r = useDados(async () => {
    if (!ativo) return null;
    const sb = supabase();
    const [comandas, kds, caixa] = await Promise.all([
      sb.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "aberto"),
      sb.from("vw_kds").select("item_id", { count: "exact", head: true }).in("status", ["pendente", "preparando"]),
      sb.from("caixas").select("status").eq("status", "aberto").maybeSingle(),
    ]);
    return {
      comandas: comandas.count ?? 0,
      kds: kds.count ?? 0,
      caixa: caixa.error ? null : caixa.data ? "aberto" : "fechado",
    };
  }, [ativo]);
  useTempoReal(["pedidos", "pedido_itens"], r.recarregar);
  return r.dados;
}

function assinarConexao(cb: () => void) {
  window.addEventListener("online", cb); window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
}
const useOnline = () => useSyncExternalStore(assinarConexao, () => navigator.onLine, () => true);

export function Shell({ children }: { children: ReactNode }) {
  const { perfil, carregando, sair } = useSessao();
  const path = usePathname();
  const router = useRouter();
  const online = useOnline();
  const [maisAberto, setMaisAberto] = useState(false);
  const resumo = useResumo(Boolean(perfil?.ativo));

  const permitido = perfil?.ativo ? rotaPermitida(path, perfil.papel) : true;
  useEffect(() => {
    if (perfil?.ativo && (!permitido || path === "/")) router.replace(INICIO[perfil.papel]);
  }, [perfil, permitido, path, router]);

  if (carregando) return <div className="min-h-dvh"><Carregando /></div>;

  if (!perfil || !perfil.ativo) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Clock className="size-12 text-brasa-600" />
        <h1 className="text-xl font-bold">Aguardando liberação</h1>
        <p className="max-w-sm text-stone-600">
          {perfil ? `Olá, ${perfil.nome}. ` : ""}Seu acesso ainda não foi liberado. Peça ao dono do restaurante
          para ativar sua conta em Configurações → Equipe.
        </p>
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => window.location.reload()}>Já liberou? Atualizar</Botao>
          <Botao variante="fantasma" onClick={sair}>Sair</Botao>
        </div>
      </main>
    );
  }

  const itens = MENU.filter((m) => m.papeis.includes(perfil.papel));
  const ativo = (href: string) => path === href || path.startsWith(href + "/") || (href === "/mesas" && path.startsWith("/comanda"));
  const iniciais = perfil.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const badge = (href: string): ReactNode => {
    if (!resumo) return null;
    if (href === "/caixa" && resumo.caixa)
      return <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
        resumo.caixa === "aberto" ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600")}>{resumo.caixa}</span>;
    if (href === "/mesas" && resumo.comandas > 0)
      return <span className="rounded bg-mostarda-100 px-1.5 py-0.5 text-[10px] font-bold text-mostarda-700">{resumo.comandas} ativas</span>;
    if (href === "/cozinha" && resumo.kds > 0)
      return <span className="rounded bg-brasa-100 px-1.5 py-0.5 text-[10px] font-bold text-brasa-700">{resumo.kds} na fila</span>;
    return null;
  };

  const secoes: { id: Secao; titulo: string }[] = [
    { id: "operacao", titulo: "Operação & Salão" },
    { id: "retaguarda", titulo: "Retaguarda" },
  ];

  const principais = itens.slice(0, 4);
  const extras = itens.slice(4);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 bg-brasa-700 px-3 text-white shadow-sm md:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          <div className="leading-none">
            <p className="text-sm font-extrabold tracking-wide">CASA VINTE GRILL</p>
            <p className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-wider text-brasa-200 sm:block">PDV · Gestão</p>
          </div>
        </Link>
        <span className={cx("ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase sm:inline-flex",
          online ? "bg-white/15" : "bg-red-500")}>
          <span className={cx("size-1.5 rounded-full", online ? "bg-emerald-400" : "bg-white")} />
          {online ? "Online" : "Sem internet"}
        </span>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {perfil.papel !== "cozinha" && (
            <Link href="/mesas"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-mostarda-400 px-3 text-sm font-bold text-carvao-900 hover:bg-mostarda-500">
              <ClipboardList className="size-4" />
              <span className="hidden sm:inline">Comandas</span>
              <span className="rounded-full bg-carvao-900/15 px-1.5 text-xs tabular">{resumo?.comandas ?? 0}</span>
            </Link>
          )}
          {perfil.papel !== "garcom" && (
            <Link href="/cozinha" className="relative rounded-full p-2 hover:bg-white/10" aria-label="Fila da cozinha">
              <Bell className="size-5" />
              {(resumo?.kds ?? 0) > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-mostarda-400" />}
            </Link>
          )}
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold">{perfil.nome}</p>
            <p className="text-[11px] text-brasa-200">{NOME_PAPEL[perfil.papel]}</p>
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">{iniciais}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Barra lateral clara */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 flex-col border-r border-brasa-100 bg-white md:flex">
          <nav className="scroll-fino flex-1 overflow-y-auto px-3 py-4">
            {secoes.map((s) => {
              const doGrupo = itens.filter((i) => i.secao === s.id);
              if (doGrupo.length === 0) return null;
              return (
                <div key={s.id} className="mb-5">
                  <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">{s.titulo}</p>
                  <div className="space-y-0.5">
                    {doGrupo.map(({ href, rotulo, icone: Icone }) => (
                      <Link key={href} href={href}
                        className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                          ativo(href) ? "bg-brasa-50 font-semibold text-brasa-700 ring-1 ring-brasa-100" : "text-stone-700 hover:bg-stone-50")}>
                        <Icone className={cx("size-[18px]", ativo(href) ? "text-brasa-600" : "text-stone-500")} />
                        <span className="flex-1">{rotulo}</span>
                        {badge(href)}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="space-y-1 p-3">
            <div className="flex items-center gap-2 rounded-xl bg-brasa-50 px-3 py-2.5 text-xs text-brasa-700">
              <Headset className="size-4" />
              <span className="font-semibold">Suporte: fale com o Alberto</span>
            </div>
            <button onClick={sair} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-7">{permitido ? children : <Carregando />}</main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-brasa-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {principais.map(({ href, rotulo, curto, icone: Icone }) => (
          <Link key={href} href={href}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold",
              ativo(href) ? "text-brasa-600" : "text-stone-500")}>
            <Icone className="size-6" /> {curto ?? rotulo}
          </Link>
        ))}
        {(
          <button onClick={() => setMaisAberto(true)}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold",
              extras.some((e) => ativo(e.href)) ? "text-brasa-600" : "text-stone-500")}>
            <MoreHorizontal className="size-6" /> Mais
          </button>
        )}
      </nav>
      {maisAberto && (
        <div className="fixed inset-0 z-50 flex items-end bg-carvao-900/50 md:hidden" onClick={() => setMaisAberto(false)}>
          <div className="w-full rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <p className="px-2 pb-2 text-sm text-stone-500">{perfil.nome} · {NOME_PAPEL[perfil.papel]}</p>
            {extras.map(({ href, rotulo, icone: Icone }) => (
              <Link key={href} href={href} onClick={() => setMaisAberto(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-stone-100">
                <Icone className="size-5 text-stone-500" /> {rotulo}
              </Link>
            ))}
            <button onClick={sair} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-medium text-red-600 hover:bg-red-50">
              <LogOut className="size-5" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
