"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, LoaderCircle, Plus, RefreshCw, ShieldCheck, UserRound, Users } from "lucide-react";
import type { ManagedUser } from "../lib/user-accounts.mjs";
import { Modal } from "./modal";

export function UserAccessPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [target, setTarget] = useState<ManagedUser | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const result = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os usuários.");
      if (current === sequence.current) setUsers(result.users || []);
    } catch (error) {
      if (current === sequence.current) { setUsers([]); setLoadError(error instanceof Error ? error.message : "Não foi possível conectar. Tente novamente."); }
    } finally { if (current === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [refresh]);

  async function mutate(payload: Record<string, unknown>) {
    setSaving(true); setFormError(""); setNotice("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 401) { window.location.replace("/login"); return false; }
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o acesso.");
      await refresh(); return true;
    } catch (error) { setFormError(error instanceof Error ? error.message : "Não foi possível conectar. Tente novamente."); return false; }
    finally { setSaving(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    if (await mutate({ action: "create", name: values.get("name"), username: values.get("username"), password: values.get("password") })) {
      setCreating(false); setShowPassword(false);
      setNotice("Acesso criado. O colaborador já pode entrar com o login e a senha cadastrados.");
    }
  }
  return <section className="user-access" aria-label="Gerenciamento de usuários e acessos">
    <div className="access-panel-heading">
      <div><span className="access-master-badge"><ShieldCheck size={15} /> Exclusivo do Master</span><h2>Quem tem acesso à agenda</h2><p>Cadastre os colaboradores autorizados a acessar a agenda da Realess.</p></div>
      <button className="button button-primary" onClick={() => { setFormError(""); setNotice(""); setShowPassword(false); setCreating(true); }}><Plus size={17} /> Novo usuário</button>
    </div>
    {notice && <p className="access-success" role="status"><Check size={17} />{notice}</p>}
    <div className="access-users-card">
      <div className="access-users-heading"><h3><Users size={19} /> Usuários cadastrados <span className="count-pill">{users.length}</span></h3><button className="button button-secondary" disabled={loading || saving} onClick={() => void refresh()}><RefreshCw size={15} /> Atualizar</button></div>
      {loading ? <p className="access-state" role="status"><LoaderCircle size={22} className="spin" /> Carregando acessos...</p> : loadError ? <div className="access-state"><p role="alert">{loadError}</p><button className="button button-secondary" onClick={() => void refresh()}>Tentar novamente</button></div> : <div className="access-table-wrap" tabIndex={0} role="region" aria-label="Lista de usuários cadastrados">
        <table className="access-users-table"><thead><tr><th scope="col">Nome</th><th scope="col">Login</th><th scope="col">Perfil</th><th scope="col">Situação</th><th scope="col">Acesso</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
          <th scope="row"><div className="access-user-name"><span className={`access-user-avatar ${user.role === "master" ? "is-master" : ""}`}>{user.role === "master" ? <ShieldCheck size={18} /> : <UserRound size={18} />}</span><strong>{user.name}</strong></div></th>
          <td className="access-username">{user.username}</td>
          <td>{user.role === "master" ? "Master" : "Colaborador"}</td>
          <td><span className={`access-status ${user.active ? "is-active" : "is-inactive"}`}><i />{user.active ? "Ativo" : "Inativo"}</span></td>
          <td>{user.role === "master" ? <span className="access-protected">Seu acesso</span> : <button className={`button button-secondary ${user.active ? "danger-text" : ""}`} onClick={() => { setTarget(user); setFormError(""); setNotice(""); }} aria-label={`${user.active ? "Desativar" : "Ativar"} acesso de ${user.name}`}>{user.active ? "Desativar" : "Ativar"}</button>}</td>
        </tr>)}</tbody></table>
      </div>}
      <p className="access-card-footnote">Cada colaborador entra com seu próprio login. Seu perfil Master mantém o controle dos acessos e de todas as reuniões.</p>
    </div>
    {creating && <Modal title="Novo usuário" subtitle="Crie um acesso individual para um colaborador da Realess." onClose={() => { if (!saving) { setCreating(false); setShowPassword(false); } }}>
      <form className="booking-form access-create-form" onSubmit={create} aria-busy={saving}>
        <label>Nome completo <span>*</span><input name="name" required minLength={2} maxLength={80} autoComplete="off" placeholder="Ex.: Anna Silva" disabled={saving} /></label>
        <label>Login <span>*</span><input name="username" required minLength={3} maxLength={80} pattern="[A-Za-z0-9._-]{3,80}" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Ex.: anna.silva" disabled={saving} /><small>Use letras sem acentos, números, ponto, hífen ou sublinhado.</small></label>
        <label htmlFor="new-user-password">Senha inicial <span>*</span></label>
        <div className="access-password-wrap"><input id="new-user-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} placeholder="Pelo menos 8 caracteres" disabled={saving} /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha inicial" : "Mostrar senha inicial"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <p className="access-form-note"><ShieldCheck size={17} /> O novo usuário terá perfil Colaborador. Somente você poderá gerenciar os acessos.</p>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setCreating(false)}>Voltar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Criar acesso</button></div>
      </form>
    </Modal>}
    {target && <Modal title={target.active ? "Desativar este acesso?" : "Ativar este acesso?"} onClose={() => { if (!saving) setTarget(null); }}>
      <p className="confirm-description"><strong>{target.name}</strong>{target.active ? " será desconectado e não poderá entrar na agenda. Seus compromissos e o histórico serão preservados." : " poderá voltar a entrar na agenda com o login e a senha cadastrados."}</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="modal-actions"><button className="button button-secondary" disabled={saving} onClick={() => setTarget(null)}>Voltar</button><button className={`button ${target.active ? "button-danger" : "button-primary"}`} disabled={saving} onClick={async () => {
        if (await mutate({ action: "setActive", id: target.id, active: !target.active })) { setNotice(target.active ? "Acesso desativado. As sessões desse usuário foram encerradas." : "Acesso ativado."); setTarget(null); }
      }}>{saving && <LoaderCircle className="spin" size={16} />}{target.active ? "Desativar acesso" : "Ativar acesso"}</button></div>
    </Modal>}
  </section>;
}
