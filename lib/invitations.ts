import {
  bookingLocation,
  normalizeMeetingLink,
  meetingLinkInfo,
  type Booking,
  type Room,
} from "./calendar.ts";
import {
  invitationRecipients,
  splitRecipients,
  validEmail,
} from "./recipients.ts";

export type Organizer = { name: string; email: string };
const oneLine = (value: string) =>
  value.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim();
const esc = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const mailbox = (email: string) =>
  `mailto:${encodeURIComponent(email.toLowerCase()).replace(/%40/g, "@")}`;

// Resolve a wall time in São Paulo using the runtime's IANA timezone data,
// including historical DST, then serialize unambiguous UTC calendar values.
export function saoPauloInstant(day: string, time: string) {
  const wall = Date.parse(`${day}T${time}:00Z`);
  let instant = wall + 3 * 3600000;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let n = 0; n < 3; n++) {
    const values = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const represented = Date.parse(
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`,
    );
    const delta = wall - represented;
    if (!delta) return new Date(instant);
    instant += delta;
  }
  throw new Error("O horário escolhido não existe no fuso de São Paulo.");
}

function foldLines(lines: string[]) {
  const encoder = new TextEncoder();
  return (
    lines
      .flatMap((line) => {
        const result: string[] = [];
        let current = "";
        for (const char of line) {
          if (encoder.encode(current + char).length > 75) {
            result.push(current);
            current = " ";
          }
          current += char;
        }
        result.push(current);
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}

export function invitationMessage(
  event: Booking,
  rooms: Room[],
  removedOnly = false,
) {
  const cancelled = event.status === "cancelled";
  const updated = !cancelled && (event.version || 1) > 1;
  const subject = cancelled
    ? `${removedOnly ? "Cancelamento de participação" : "Cancelamento de reunião"} — ${oneLine(event.title)}`
    : `${updated ? "Atualização de reunião presencial" : "Convite para reunião presencial"} — ${oneLine(event.title)}`;
  const body = [
    "Olá,",
    "",
    cancelled
      ? removedOnly
        ? "Sua participação na reunião abaixo foi cancelada na Agenda Realess. A reunião continua agendada para os demais participantes."
        : "A reunião abaixo foi cancelada na Agenda Realess."
      : updated
        ? "Os dados da reunião presencial abaixo foram atualizados na Agenda Realess."
        : "Você está convidado(a) para participar de uma reunião presencial agendada pela Agenda Realess.",
    "",
    `Reunião: ${oneLine(event.title)}`,
    `Data: ${event.date.split("-").reverse().join("/")}`,
    `Horário: ${event.start} às ${event.end} (horário de Brasília / São Paulo)`,
    "Formato: Presencial",
    `Local: ${event.roomId ? bookingLocation(event, rooms) : "Sala não informada"}`,
    `Organizada por: ${oneLine(event.ownerName || "Responsável não informado")}`,
    ...(event.description
      ? ["", "Descrição:", event.description.replace(/\r\n|\r/g, "\n")]
      : []),
    "",
    "Atenciosamente,",
    "Agenda Realess",
  ]
    .join("\n")
    .replace(/\r\n|\r|\n/g, "\r\n");
  const recipients = invitationRecipients(event.participants);
  const addresses = recipients.map(encodeURIComponent).join(",");
  const mailto = `mailto:${addresses}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return {
    subject,
    body,
    recipients,
    mailto,
    shortMailto: `mailto:${addresses}?subject=${encodeURIComponent(subject)}`,
    // Conservative interoperability threshold, not a browser protocol limit.
    longMailto: mailto.length > 1800,
  };
}

export function createInvitationICS(
  event: Booking,
  rooms: Room[],
  organizer: Organizer,
  now = new Date(),
) {
  if (!validEmail(organizer.email))
    throw new Error(
      "Informe um e-mail válido do organizador no compromisso para gerar o convite.",
    );
  const recipients = invitationRecipients(event.participants);
  if (!recipients.length)
    throw new Error("Adicione pelo menos um participante com e-mail válido.");
  if (splitRecipients(event.participants).some((part) => !validEmail(part)))
    throw new Error(
      "Substitua os participantes cadastrados só por nome pelos respectivos e-mails antes de gerar o convite.",
    );
  const cancelled = event.status === "cancelled";
  const link = cancelled
    ? meetingLinkInfo(event.link || "")?.url || ""
    : normalizeMeetingLink(event.link || "");
  const changed = event.updatedAt || event.createdAt;
  return foldLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Realess//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${esc(event.id)}@agenda.realess`,
    `DTSTAMP:${stamp(changed ? new Date(changed) : now)}`,
    `SEQUENCE:${Math.max(0, (event.version || 1) - 1)}`,
    `DTSTART:${stamp(saoPauloInstant(event.date, event.start))}`,
    `DTEND:${stamp(saoPauloInstant(event.date, event.end))}`,
    `ORGANIZER:${mailbox(organizer.email)}`,
    ...recipients.map((email) =>
      cancelled
        ? `ATTENDEE:${mailbox(email)}`
        : `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:${mailbox(email)}`,
    ),
    `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc(bookingLocation(event, rooms))}`,
    `DESCRIPTION:${esc([event.description, link].filter(Boolean).join("\n\n"))}`,
    ...(link ? [`URL:${link}`] : []),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}
