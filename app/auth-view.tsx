"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, LoaderCircle, Lock, Mail, User, Sparkles } from "lucide-react";

type AuthViewProps = {
  onSuccess: () => void;
  isModal?: boolean;
};

export function AuthView({ onSuccess, isModal = false }: AuthViewProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: tab,
          name: tab === "register" ? name : undefined,
          email,
          password,
        }),
      });

      const data = (await response.json()) as { error?: string; ok?: boolean };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível concluir a ação. Tente novamente.");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar solicitação.");
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <div className={isModal ? "auth-card-modal" : "auth-card"}>
      {!isModal && (
        <div className="auth-brand">
          <img
            className="brand-logo auth-logo"
            src="/realess-logo-hd.png"
            alt="Realess · Cobranças Empresariais"
            width={1080}
            height={463}
          />
          <div className="auth-eyebrow">
            <span></span> SISTEMA DE AGENDAMENTO E SALAS
          </div>
          <h1>Agenda Realess</h1>
          <p className="auth-lead">
            {tab === "login"
              ? "Entre com suas credenciais corporativas para gerenciar salas e reuniões."
              : "Cadastre-se em segundos para agendar salas e reuniões para qualquer pessoa."}
          </p>
        </div>
      )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`auth-tab ${tab === "login" ? "is-active" : ""}`}
            onClick={() => {
              setTab("login");
              setError("");
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={`auth-tab ${tab === "register" ? "is-active" : ""}`}
            onClick={() => {
              setTab("register");
              setError("");
            }}
          >
            Criar conta
          </button>
        </div>

        {error && (
          <div className="auth-alert danger-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === "register" && (
            <div className="auth-field">
              <label htmlFor="auth-name">
                <User size={15} /> Nome completo
              </label>
              <input
                id="auth-name"
                type="text"
                required
                autoComplete="name"
                maxLength={100}
                placeholder="Ex: Vicenzzo Palma"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">
              <Mail size={15} /> E-mail
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              placeholder="Ex: seu.nome@realess.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">
              <Lock size={15} /> Senha
            </label>
            <input
              id="auth-password"
              type="password"
              required
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              minLength={4}
              placeholder={tab === "register" ? "Mínimo 4 caracteres" : "Sua senha"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {tab === "register" && (
            <div className="auth-instant-note">
              <Sparkles size={16} />
              <span>
                <strong>Acesso imediato:</strong> Ao se cadastrar você já entra no sistema e pode agendar reuniões para qualquer pessoa ou sala.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="button button-primary auth-submit"
          >
            {loading ? (
              <>
                <LoaderCircle className="spin" size={17} />
                <span>Processando...</span>
              </>
            ) : tab === "login" ? (
              <>
                <span>Entrar na Agenda</span>
                <ArrowRight size={17} />
              </>
            ) : (
              <>
                <span>Cadastrar e Começar a Usar</span>
                <Check size={17} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          {tab === "login" ? (
            <p>
              Ainda não tem conta?{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setTab("register");
                  setError("");
                }}
              >
                Cadastre-se gratuitamente
              </button>
            </p>
          ) : (
            <p>
              Já possui uma conta?{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setTab("login");
                  setError("");
                }}
              >
                Faça login
              </button>
            </p>
          )}
        </div>
      </div>
  );

  if (isModal) {
    return content;
  }

  return <div className="auth-wrapper">{content}</div>;
}
