import type { Papel, StatusItem, TipoPedido } from "./types";

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number | string | null | undefined) => brlFmt.format(Number(v ?? 0));

export const num = (v: number | string | null | undefined, casas = 0) =>
  Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Converte "12,50" ou "12.50" para número. */
export const parseValor = (s: string): number => {
  const limpo = s.trim().replace(/\s|R\$/g, "");
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
};

export const qtd = (q: number, unidade?: "UN" | "KG") =>
  unidade === "KG" || q % 1 !== 0 ? `${num(q, 3)} kg` : `${num(q)}x`;

export const tempo = (minutos: number | null | undefined) => {
  const m = Math.max(0, Math.floor(minutos ?? 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};

export const minutosDesde = (iso: string, agora = Date.now()) => Math.floor((agora - new Date(iso).getTime()) / 60000);

export const dataCurta = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Data de hoje (YYYY-MM-DD) no fuso local do aparelho. */
export const hojeISO = (deslocDias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + deslocDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const NOME_TIPO: Record<TipoPedido, string> = {
  mesa: "Mesa", balcao: "Balcão", delivery: "Delivery", ifood: "iFood", "99food": "99Food",
};

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono", gerente: "Gerente", caixa: "Caixa", garcom: "Garçom", cozinha: "Cozinha",
};

export const NOME_STATUS_ITEM: Record<StatusItem, string> = {
  pendente: "Na fila", preparando: "Preparando", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado",
};

/** Mensagem amigável a partir do erro do Supabase/Postgres. */
export function erroMsg(e: unknown): string {
  if (!e) return "Erro desconhecido";
  if (typeof e === "string") return e;
  const err = e as { message?: string; code?: string };
  if (err.code === "42501" && !err.message?.match(/[a-zà-ú]{4,}/i)) return "Você não tem permissão para isso.";
  if (err.message?.includes("violates row-level security")) return "Você não tem permissão para isso.";
  if (err.message?.includes("Failed to fetch")) return "Sem conexão com o servidor. Verifique a internet.";
  return err.message ?? "Erro desconhecido";
}
