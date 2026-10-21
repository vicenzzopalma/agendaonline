"use client";

import { CheckCircle2, Copy, ExternalLink, Video } from "lucide-react";
import { meetingLinkInfo } from "../lib/calendar";

export function MeetingLinkField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const info = meetingLinkInfo(value);
  return <section className="meeting-field" aria-label="Vincular reunião do Google Meet">
    <div className="meeting-field-header">
      <div><span className="meeting-service-icon"><Video size={17}/></span><strong>Google Meet</strong></div>
      <a href="https://meet.google.com/" target="_blank" rel="noopener noreferrer">Abrir Google Meet<ExternalLink size={12}/></a>
    </div>
    <label htmlFor="google-meet-link">Link do Google Meet<span className="optional">opcional</span></label>
    <input id="google-meet-link" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500} placeholder="https://meet.google.com/abc-defg-hij" aria-describedby="meeting-link-help" value={value} onChange={event => onChange(event.target.value)} onBlur={() => { if(info && info.url !== value) onChange(info.url); }}/>
    <p id="meeting-link-help">Crie a reunião no Meet, copie o link e cole aqui. Ele ficará disponível no compromisso para entrar na chamada.</p>
    {info && <div className="meeting-link-ready"><span><CheckCircle2 size={14}/>{info.isMeet ? "Link do Meet adicionado" : "Link de reunião adicionado"}</span><a href={info.url} target="_blank" rel="noopener noreferrer">Testar link<ExternalLink size={11}/></a></div>}
  </section>;
}

export function MeetingLinkDetail({ value, onCopy, onAddLink }: { value: string; onCopy: (url: string) => void; onAddLink?: () => void }) {
  const info = meetingLinkInfo(value);
  if (!info) return <section className="meeting-detail-card" aria-label="Link da reunião">
    <div className="meeting-detail-heading"><span className="meeting-service-icon"><Video size={20}/></span><div><strong>Link da reunião</strong><span>{onAddLink ? "Este compromisso ainda não tem um link de reunião." : "O organizador ainda não adicionou um link de reunião."}</span></div></div>
    {onAddLink && <button className="button button-secondary" type="button" onClick={onAddLink}><Video size={16}/>Adicionar link do Meet</button>}
  </section>;
  return <section className="meeting-detail-card" aria-label={info.isMeet ? "Reunião no Google Meet" : "Reunião online"}>
    <div className="meeting-detail-heading"><span className="meeting-service-icon"><Video size={20}/></span><div><strong>{info.isMeet ? "Google Meet" : "Reunião online"}</strong><span>Acesse a chamada pelo link da reunião.</span></div></div>
    <a className="meeting-url" href={info.url} target="_blank" rel="noopener noreferrer">{info.url}</a>
    <div className="meeting-card-actions"><a className="button button-primary join-link" href={info.url} target="_blank" rel="noopener noreferrer"><Video size={16}/>{info.isMeet ? "Entrar no Meet" : "Entrar na reunião"}<ExternalLink size={13}/></a><button className="button button-secondary copy-meeting-link" type="button" onClick={() => onCopy(info.url)}><Copy size={15}/>Copiar link</button></div>
  </section>;
}
