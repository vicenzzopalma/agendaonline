"use client";
import { useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { meetingLinkInfo, type Booking, type Room } from "../lib/calendar";
import {
  createInvitationICS,
  invitationMessage,
  type Organizer,
} from "../lib/invitations";
import { splitRecipients, validEmail } from "../lib/recipients";
import { Modal } from "./modal";

export function InvitationDialog({
  event,
  rooms,
  organizer,
  onClose,
  removedEvent,
  removedOnly = false,
  onPrepareRemoved,
}: {
  event: Booking;
  rooms: Room[];
  organizer: Organizer;
  onClose: () => void;
  removedEvent?: Booking | null;
  removedOnly?: boolean;
  onPrepareRemoved?: () => void;
}) {
  const [notice, setNotice] = useState("");
  const message = invitationMessage(event, rooms, removedOnly);
  const legacy = splitRecipients(event.participants).some(
    (part) => !validEmail(part),
  );
  const invalidLink =
    !!event.link &&
    !meetingLinkInfo(event.link) &&
    event.status !== "cancelled";
  const canPrepare = !legacy && !invalidLink && message.recipients.length > 0;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Conteúdo copiado. Cole no aplicativo de e-mail.");
    } catch {
      setNotice("Selecione e copie o texto da prévia abaixo.");
    }
  }
  function download() {
    try {
      const content = createInvitationICS(event, rooms, organizer);
      const url = URL.createObjectURL(
        new Blob([content], {
          type: `text/calendar;charset=utf-8;method=${event.status === "cancelled" ? "CANCEL" : "REQUEST"}`,
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `realess-${event.status === "cancelled" ? "cancelamento" : "convite"}-${event.id}.ics`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Arquivo gerado. Abra no Outlook e confira os dados. Se necessário, anexe o arquivo a uma mensagem e confirme o envio. Nada foi enviado pela agenda.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  return (
    <Modal
      title={
        removedOnly
          ? "Avisar participantes removidos"
          : event.status === "cancelled"
            ? "Preparar cancelamento"
            : (event.version || 1) > 1
              ? "Preparar atualização"
              : "Preparar convite"
      }
      subtitle={
        removedOnly
          ? "Alteração salva. Deseja preparar o aviso de retirada destes participantes?"
          : event.status === "cancelled"
            ? "Cancelamento salvo no histórico. Deseja preparar o aviso aos participantes?"
            : "Compromisso salvo com sucesso. Deseja preparar o convite para os participantes?"
      }
      onClose={onClose}
    >
      <div className="invitation-content">
        {removedEvent && onPrepareRemoved && (
          <div className="invitation-note">
            <p>
              Participantes removidos não recebem a atualização da lista atual.
              Prepare um aviso separado para retirar o compromisso dos
              calendários deles.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={onPrepareRemoved}
            >
              Avisar participantes removidos
            </button>
          </div>
        )}
        <p>
          O Outlook clássico será usado se estiver definido como aplicativo
          padrão no Windows. Confira os destinatários e confirme o envio no
          aplicativo.
        </p>
        <div>
          <strong>Destinatários</strong>
          <p className="invitation-recipients">
            {message.recipients.join("; ") ||
              "Nenhum e-mail válido cadastrado."}
          </p>
        </div>
        {invalidLink && (
          <p role="alert" className="form-error">
            O link desta reunião antiga é inválido. Edite o compromisso e
            corrija o link antes de preparar o convite.
          </p>
        )}
        {legacy && (
          <p role="alert" className="form-error">
            Há participantes cadastrados só por nome. Edite o compromisso e
            informe os e-mails antes de preparar o convite.
          </p>
        )}
        {message.longMailto && canPrepare && (
          <p className="invitation-note">
            Esta mensagem é longa para alguns aplicativos. Copie o texto
            completo abaixo antes de abrir o e-mail e cole no corpo da mensagem,
            ou use o convite .ics.
          </p>
        )}
        <div className="invitation-buttons">
          {canPrepare && (
            <a
              className="button button-primary"
              href={message.longMailto ? message.shortMailto : message.mailto}
              onClick={() =>
                setNotice(
                  "A abertura foi solicitada ao aplicativo padrão. Confira e confirme o envio nele. A agenda não recebe confirmação de entrega.",
                )
              }
            >
              <Mail size={17} />
              {message.longMailto
                ? "Abrir e-mail e colar o texto"
                : "Abrir no aplicativo de e-mail"}
            </a>
          )}
          <button
            type="button"
            className="button button-secondary"
            disabled={!canPrepare}
            onClick={download}
          >
            <Download size={17} />
            Gerar convite para Outlook (.ics)
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => copy(message.body)}
          >
            <Copy size={16} />
            Copiar texto completo
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!message.recipients.length}
            onClick={() => copy(message.recipients.join("; "))}
          >
            <Copy size={16} />
            Copiar destinatários
          </button>
        </div>
        <small>
          O e-mail contém o texto e o link da reunião. O arquivo .ics é baixado
          separadamente; para enviar também o convite de calendário, anexe-o no
          Outlook. Use a conta {organizer.email} como organizador para manter as
          atualizações do calendário.
        </small>
        <details className="invitation-preview" open>
          <summary>Conferir mensagem</summary>
          <strong>{message.subject}</strong>
          <pre>{message.body}</pre>
        </details>
        <details className="invitation-help">
          <summary>Configurar o Outlook clássico no Windows</summary>
          <p>
            Em Configurações → Aplicativos → Aplicativos padrão, selecione
            Outlook (clássico) para o protocolo MAILTO e a extensão .ics. Ao
            baixar o convite, abra o arquivo no Outlook. A abertura e o envio
            dependem das configurações do computador.
          </p>
        </details>
        {notice && (
          <p role="status" className="invitation-note">
            {notice}
          </p>
        )}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          Agora não
        </button>
      </div>
    </Modal>
  );
}
