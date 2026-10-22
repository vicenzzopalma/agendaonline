"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      window.location.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar. Tente novamente."); setLoading(false); }
  }
  return <form className="login-form" onSubmit={submit} aria-busy={loading}>
    <label htmlFor="login-username">Login</label>
    <div className="login-input-wrap"><UserRound size={19} aria-hidden="true" /><input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Seu usuário" required minLength={3} maxLength={80} disabled={loading} /></div>
    <label htmlFor="login-password">Senha</label>
    <div className="login-input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha" required maxLength={128} disabled={loading} /><button type="button" className="login-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
    {error && <p role="alert" className="login-error">{error}</p>}
    <button className="login-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={19} className="spin" /> Entrando...</> : <>Entrar na agenda <ArrowRight size={19} /></>}</button>
  </form>;
}
