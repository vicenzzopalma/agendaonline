export type Room = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  equipment: string;
  color: string;
  active: number;
};
export type Booking = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  roomId: string | null;
  kind: string;
  description: string;
  participants: string;
  link: string;
  ownerId: string;
  ownerName: string;
  createdAt?: number;
  updatedAt?: number;
  cancelledAt?: number | null;
  status?: "active" | "cancelled";
  version?: number;
  demo?: boolean;
};
export const TZ = "America/Sao_Paulo";
export const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date);
export const parseDay = (day: string) => new Date(`${day}T12:00:00-03:00`);
export const addDays = (day: string, amount: number) => {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + amount);
  return dateKey(d);
};
export const monday = (day: string) =>
  addDays(day, -((parseDay(day).getUTCDay() + 6) % 7));
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const toTime = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export const MEETING_LINK_ERROR =
  "Cole um link válido do Google Meet (https://meet.google.com/...) ou de outra reunião online com https://.";
export function normalizeMeetingLink(value: string): string {
  let raw = value.trim();
  if (!raw) return "";
  if (/^meet\.google\.com(?:[/?#]|$)/i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /\s/.test(raw)
    )
      throw new Error();
    if (url.hostname === "meet.google.com" && url.pathname === "/")
      throw new Error();
    return url.href;
  } catch {
    throw new Error(MEETING_LINK_ERROR);
  }
}
export function meetingLinkInfo(
  value: string,
): { url: string; isMeet: boolean } | null {
  try {
    const url = normalizeMeetingLink(value);
    if (!url) return null;
    const parsed = new URL(url);
    return {
      url,
      isMeet: parsed.hostname === "meet.google.com" && !parsed.port,
    };
  } catch {
    return null;
  }
}
export const bookingLocation = (
  event: Pick<Booking, "roomId" | "kind" | "link">,
  rooms: Room[],
) =>
  rooms.find((room) => room.id === event.roomId)?.name ||
  (meetingLinkInfo(event.link || "")?.isMeet
    ? "Google Meet"
    : event.link || event.kind === "online"
      ? "Online"
      : "Sem sala de reunião");
export const overlaps = (
  a: Pick<Booking, "date" | "start" | "end" | "roomId"> & { status?: string },
  b: Pick<Booking, "date" | "start" | "end" | "roomId"> & { status?: string },
) =>
  a.status !== "cancelled" &&
  b.status !== "cancelled" &&
  !!a.roomId &&
  a.roomId === b.roomId &&
  a.date === b.date &&
  a.start < b.end &&
  a.end > b.start;

export const bookingStatus = (event: Booking, today: string, time: string) =>
  event.status === "cancelled"
    ? "Cancelado"
    : event.date < today || (event.date === today && event.end <= time)
      ? "Realizado"
      : "Agendado";
export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function placeEvents(events: Booking[]) {
  const sorted = [...events].sort(
    (a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end),
  );
  const groups: Booking[][] = [];
  let latestEnd = "";
  for (const event of sorted) {
    if (!groups.length || event.start >= latestEnd) {
      groups.push([]);
      latestEnd = "";
    }
    groups[groups.length - 1].push(event);
    if (event.end > latestEnd) latestEnd = event.end;
  }
  return groups.flatMap((group) => {
    const ends: string[] = [];
    const positioned = group.map((event) => {
      let lane = ends.findIndex((end) => end <= event.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = event.end;
      return { event, lane };
    });
    return positioned.map((item) => ({ ...item, lanes: ends.length }));
  });
}
export function createICS(events: Booking[], rooms: Room[], now = new Date()) {
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Realess//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of events)
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@agenda.realess`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(new Date(`${event.date}T${event.start}:00-03:00`))}`,
      `DTEND:${stamp(new Date(`${event.date}T${event.end}:00-03:00`))}`,
      `SUMMARY:${esc(event.title)}`,
      `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `DESCRIPTION:${esc([event.description, event.link].filter(Boolean).join("\n"))}`,
      `LOCATION:${esc(bookingLocation(event, rooms))}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  const encoder = new TextEncoder();
  return (
    lines
      .flatMap((line) => {
        const folded: string[] = [];
        let current = "";
        for (const char of line) {
          if (encoder.encode(current + char).length > 75) {
            folded.push(current);
            current = " ";
          }
          current += char;
        }
        folded.push(current);
        return folded;
      })
      .join("\r\n") + "\r\n"
  );
}
