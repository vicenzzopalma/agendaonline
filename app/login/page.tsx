import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth-store.mjs";
import { publicOrigin } from "../../lib/runtime";
import LoginForm from "./login-form";

export default async function LoginPage() {
  if (getSessionUser((await cookies()).toString(), publicOrigin())) redirect("/");
  return <main className="login-page">
    <section className="login-brand-panel" aria-label="Realess">
      <div className="login-brand-top"><span className="login-brand-dot" /> NOSSO TEMPO, BEM ORGANIZADO.</div>
      <div className="login-brand-center">
        <div className="login-logo-window"><img src="/realess-logo-hd.png" alt="Realess — Cobranças Empresariais" width={1080} height={1080} /></div>
        <span className="login-brand-rule" />
        <h1>Mais organização.<br /> Mais tempo para fazer.</h1>
        <p>Reuniões, espaços e compromissos.<br />Sua equipe conectada, em um só lugar.</p>
      </div>
      <div className="login-brand-footer">AGENDA REALESS <span>FEITO PARA CONECTAR</span></div>
    </section>
    <section className="login-form-panel" aria-labelledby="login-title">
      <div className="login-form-wrap">
        <span className="login-eyebrow">BEM-VINDO À SUA AGENDA</span>
        <h2 id="login-title">Seu dia começa aqui.</h2>
        <p className="login-intro">Entre com seu login e senha para acessar a agenda da Realess.</p>
        <LoginForm />
        <p className="login-help">Precisa de acesso? Fale com o responsável pela agenda.</p>
      </div>
      <p className="login-access-note"><span /> Acesso exclusivo à equipe autorizada.</p>
    </section>
  </main>;
}
