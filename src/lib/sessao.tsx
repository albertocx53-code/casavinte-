"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase/client";
import type { Papel, Perfil } from "./types";

type Sessao = { perfil: Perfil | null; carregando: boolean; sair: () => Promise<void> };
const Ctx = createContext<Sessao>({ perfil: null, carregando: true, sair: async () => {} });
export const useSessao = () => useContext(Ctx);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const sb = supabase();
    let ativo = true;
    async function carregar() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) {
        if (ativo) { setPerfil(null); setCarregando(false); }
        return;
      }
      const { data } = await sb.from("perfis").select("*").eq("id", u.user.id).maybeSingle();
      if (ativo) { setPerfil((data as Perfil) ?? null); setCarregando(false); }
    }
    carregar();
    const { data: sub } = sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") window.location.href = "/login";
      if (evento === "SIGNED_IN" || evento === "USER_UPDATED") carregar();
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, []);

  const sair = async () => {
    await supabase().auth.signOut();
    window.location.href = "/login";
  };

  return <Ctx.Provider value={{ perfil, carregando, sair }}>{children}</Ctx.Provider>;
}

/** O perfil atual tem um destes papéis? */
export function usePode(...papeis: Papel[]) {
  const { perfil } = useSessao();
  return Boolean(perfil?.ativo && papeis.includes(perfil.papel));
}

/** Página inicial de cada papel. */
export const INICIO: Record<Papel, string> = {
  dono: "/painel", gerente: "/painel", caixa: "/mesas", garcom: "/mesas", cozinha: "/cozinha",
};
