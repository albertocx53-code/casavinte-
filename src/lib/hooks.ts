"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase/client";
import { erroMsg } from "./format";

/**
 * Carrega dados com uma função async e devolve { dados, erro, carregando, recarregar }.
 * `deps` controla quando recarregar (como no useEffect).
 */
export function useDados<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  const recarregar = useCallback(async () => {
    try {
      const r = await fnRef.current();
      setDados(r);
      setErro(null);
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // ao mudar deps os dados antigos ficam na tela até os novos chegarem
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { dados, erro, carregando, recarregar };
}

/** Lança o erro do Supabase, se houver, e devolve os dados. */
export async function q<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

/** Chama uma função do banco (RPC) e lança erro amigável. */
export async function rpc<T = unknown>(nome: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(nome, params);
  if (error) throw new Error(erroMsg(error));
  return data as T;
}

/**
 * Escuta mudanças em tempo real numa ou mais tabelas e chama `aoMudar`
 * (com um pequeno atraso para agrupar várias mudanças seguidas).
 */
export function useTempoReal(tabelas: string[], aoMudar: () => void) {
  const cb = useRef(aoMudar);
  useEffect(() => { cb.current = aoMudar; });
  const chave = tabelas.join(",");
  useEffect(() => {
    const sb = supabase();
    let t: ReturnType<typeof setTimeout> | undefined;
    const disparar = () => { clearTimeout(t); t = setTimeout(() => cb.current(), 250); };
    const canal = sb.channel(`rt-${chave}-${Math.random().toString(36).slice(2)}`);
    chave.split(",").forEach((tabela) =>
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabela }, disparar));
    canal.subscribe();
    // rede de segurança: recarrega a cada 60s e ao voltar para a aba
    const intervalo = setInterval(() => cb.current(), 60_000);
    const visivel = () => document.visibilityState === "visible" && cb.current();
    document.addEventListener("visibilitychange", visivel);
    return () => {
      clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", visivel);
      sb.removeChannel(canal);
    };
  }, [chave]);
}

/** Relógio que atualiza a cada `ms` (para contadores de tempo). */
export function useAgora(ms = 30_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return agora;
}
