"use client";

import { X, Loader2 } from "lucide-react";
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

// ---------------------------------------------------------------- Botão
type Variante = "primario" | "secundario" | "perigo" | "fantasma" | "sucesso" | "suave" | "mostarda";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-brasa-600 text-white hover:bg-brasa-700 active:bg-brasa-700 shadow-sm",
  secundario: "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 active:bg-stone-100",
  suave: "bg-brasa-50 text-brasa-700 border border-brasa-100 hover:bg-brasa-100 active:bg-brasa-100",
  mostarda: "bg-mostarda-400 text-carvao-900 hover:bg-mostarda-500 shadow-sm",
  perigo: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
  sucesso: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm",
  fantasma: "text-stone-700 hover:bg-stone-200/60 active:bg-stone-200",
};

export function Botao({
  variante = "primario", tamanho = "md", carregando, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: "sm" | "md" | "lg"; carregando?: boolean }) {
  const tam = tamanho === "sm" ? "h-9 px-3 text-sm" : tamanho === "lg" ? "h-14 px-6 text-lg" : "h-11 px-4 text-[15px]";
  return (
    <button
      {...rest}
      disabled={disabled || carregando}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none",
        "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brasa-500",
        tam, VARIANTES[variante], className,
      )}
    >
      {carregando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Campos
export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-stone-700">{rotulo}</span>
      {children}
      {dica && <span className="text-xs text-stone-500">{dica}</span>}
    </label>
  );
}

const campoBase =
  "h-11 rounded-xl border border-stone-300 bg-white px-3 text-[15px] text-stone-900 placeholder:text-stone-400 " +
  "focus:border-brasa-500 focus:outline-none focus:ring-3 focus:ring-brasa-500/20 disabled:bg-stone-100";

export function Entrada({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(campoBase, !/\bw-/.test(className ?? "") && "w-full", className)} />;
}

export function Selecao({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(campoBase, "pr-8", !/\bw-/.test(className ?? "") && "w-full", className)}>{children}</select>;
}

export function Chave({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo?: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}
      className="inline-flex items-center gap-2 text-sm text-stone-700">
      <span className={cx("relative h-6 w-11 rounded-full transition-colors", ligado ? "bg-emerald-600" : "bg-stone-300")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", ligado ? "left-5.5" : "left-0.5")} />
      </span>
      {rotulo}
    </button>
  );
}

// ---------------------------------------------------------------- Cartão / etiqueta
export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-brasa-100/70 bg-white shadow-[0_1px_3px_rgba(134,42,23,0.05)]", className)}>{children}</div>;
}

type Tom = "neutro" | "brasa" | "verde" | "amarelo" | "vermelho" | "azul";
const TONS: Record<Tom, string> = {
  neutro: "bg-stone-100 text-stone-700",
  brasa: "bg-brasa-100 text-brasa-700",
  verde: "bg-emerald-100 text-emerald-800",
  amarelo: "bg-amber-100 text-amber-800",
  vermelho: "bg-red-100 text-red-700",
  azul: "bg-sky-100 text-sky-800",
};
export function Etiqueta({ tom = "neutro", children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", TONS[tom], className)}>{children}</span>;
}

export function Titulo({ children, acoes, sub, modulo }: { children: ReactNode; acoes?: ReactNode; sub?: ReactNode; modulo?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {modulo && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brasa-600">{modulo}</p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 md:text-3xl">{children}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-stone-500">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- KPI (cartão de indicador)
type TomKpi = "neutro" | "verde" | "vermelho" | "mostarda" | "brasa";
const TOM_KPI: Record<TomKpi, { valor: string; chip: string; barra: string }> = {
  neutro: { valor: "text-stone-900", chip: "bg-stone-100 text-stone-600", barra: "bg-stone-400" },
  verde: { valor: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700", barra: "bg-emerald-600" },
  vermelho: { valor: "text-brasa-600", chip: "bg-brasa-50 text-brasa-600", barra: "bg-brasa-600" },
  mostarda: { valor: "text-mostarda-700", chip: "bg-mostarda-100 text-mostarda-700", barra: "bg-mostarda-500" },
  brasa: { valor: "text-brasa-700", chip: "bg-brasa-50 text-brasa-700", barra: "bg-brasa-700" },
};
export function Kpi({ rotulo, valor, icone, tom = "neutro", rodape, progresso, etiqueta }: {
  rotulo: string; valor: ReactNode; icone?: ReactNode; tom?: TomKpi; rodape?: ReactNode; progresso?: number; etiqueta?: ReactNode;
}) {
  const t = TOM_KPI[tom];
  return (
    <Cartao className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">{rotulo}</p>
          {etiqueta}
        </div>
        {icone && <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4", t.chip)}>{icone}</span>}
      </div>
      <p className={cx("valor text-2xl font-bold md:text-[28px]", t.valor)}>{valor}</p>
      {rodape && <div className="text-xs text-stone-500">{rodape}</div>}
      {progresso !== undefined && (
        <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className={cx("h-full rounded-full", t.barra)} style={{ width: `${Math.max(0, Math.min(100, progresso))}%` }} />
        </div>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------- Filtros em pílula
export function Pilulas<T extends string>({ opcoes, valor, onChange }: {
  opcoes: { id: T; rotulo: ReactNode; qtd?: number; ponto?: "vermelho" | "mostarda" | "verde" }[]; valor: T; onChange: (v: T) => void;
}) {
  const cores = { vermelho: "bg-brasa-600", mostarda: "bg-mostarda-500", verde: "bg-emerald-600" };
  return (
    <div className="scroll-fino -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {opcoes.map((o) => {
        const sel = o.id === valor;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
              sel ? "bg-brasa-600 text-white" : "bg-brasa-50 text-stone-700 hover:bg-brasa-100")}>
            {o.ponto && <span className={cx("size-1.5 rounded-full", sel ? "bg-white" : cores[o.ponto])} />}
            {o.rotulo}
            {o.qtd !== undefined && (
              <span className={cx("rounded-full px-1.5 text-[11px] tabular", sel ? "bg-white/25" : "bg-white text-stone-600")}>{o.qtd}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Tabela
export function Tabela({ cabecalho, children, vazio }: { cabecalho: ReactNode[]; children: ReactNode; vazio?: ReactNode }) {
  return (
    <div className="scroll-fino overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left">
            {cabecalho.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-stone-500">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
      {vazio}
    </div>
  );
}

export function Vazio({ icone, titulo, texto, acao }: { icone?: ReactNode; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center">
      {icone && <div className="text-stone-400">{icone}</div>}
      <p className="font-semibold text-stone-700">{titulo}</p>
      {texto && <p className="max-w-sm text-sm text-stone-500">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-stone-500">
      <Loader2 className="size-5 animate-spin" /> {texto}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({
  aberto, aoFechar, titulo, children, rodape, largura = "md",
}: { aberto: boolean; aoFechar: () => void; titulo: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  const w = largura === "sm" ? "sm:max-w-sm" : largura === "lg" ? "sm:max-w-2xl" : "sm:max-w-md";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-carvao-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={ref} role="dialog" aria-modal="true"
        className={cx("flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-bold text-stone-900">{titulo}</h2>
          <button onClick={aoFechar} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-fino overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex gap-2 border-t border-stone-100 px-5 py-4">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Avisos (toast)
type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };
const AvisoCtx = createContext<(texto: string, tipo?: "ok" | "erro") => void>(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function AvisoProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: "ok" | "erro" = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 6000 : 3000);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {avisos.map((a) => (
          <div key={a.id} role="status"
            className={cx("pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg",
              a.tipo === "erro" ? "bg-red-600" : "bg-carvao-900")}>
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

// ---------------------------------------------------------------- Abas
export function Abas<T extends string>({ abas, valor, onChange }: { abas: { id: T; rotulo: ReactNode }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="scroll-fino flex gap-1 overflow-x-auto rounded-xl bg-stone-200/70 p-1">
      {abas.map((a) => (
        <button key={a.id} onClick={() => onChange(a.id)}
          className={cx("whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            valor === a.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900")}>
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}
