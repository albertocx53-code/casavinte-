"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Botao, Campo, Entrada } from "@/components/ui";
import { erroMsg } from "@/lib/format";

export default function LoginPage() {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setInfo(null); setEnviando(true);
    try {
      const sb = supabase();
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
        window.location.href = "/";
      } else {
        const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome } } });
        if (error) throw error;
        if (data.session) window.location.href = "/";
        else setInfo("Cadastro feito. Confirme pelo link enviado ao seu e-mail e depois entre.");
      }
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brasa-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 size-16 rounded-2xl" />
          <h1 className="text-2xl font-bold text-white">Casa Vinte Grill</h1>
          <p className="mt-1 text-sm text-brasa-200">Comandas, caixa e cozinha</p>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
          {modo === "cadastrar" && (
            <Campo rotulo="Seu nome">
              <Entrada value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
            </Campo>
          )}
          <Campo rotulo="E-mail">
            <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"} />
          </Campo>
          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}
          <Botao type="submit" className="w-full" tamanho="lg" carregando={enviando}>
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </Botao>
          <button type="button" onClick={() => setModo(modo === "entrar" ? "cadastrar" : "entrar")}
            className="w-full text-center text-sm text-stone-600 hover:text-brasa-700">
            {modo === "entrar" ? "Funcionário novo? Criar conta" : "Já tenho conta"}
          </button>
          {modo === "cadastrar" && (
            <p className="text-center text-xs text-stone-500">Depois de criar a conta, peça ao dono para liberar seu acesso.</p>
          )}
        </form>
      </div>
    </main>
  );
}
