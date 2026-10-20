export type Room = { id: string; name: string; capacity: number; location: string; equipment: string; color: string; active: number };
export type Booking = { id: string; title: string; date: string; start: string; end: string; roomId: string | null; kind: string; description: string; participants: string; link: string; ownerId: string; ownerName: string; createdAt?: number; demo?: boolean };
export const TZ = "America/Sao_Paulo";
export const dateKey = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date);
export const parseDay = (day: string) => new Date(`${day}T12:00:00-03:00`);
export const addDays = (day: string, amount: number) => { const d = parseDay(day); d.setUTCDate(d.getUTCDate() + amount); return dateKey(d); };
export const monday = (day: string) => addDays(day, -((parseDay(day).getUTCDay() + 6) % 7));
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const toTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export const overlaps = (a: Pick<Booking, "date" | "start" | "end" | "roomId">, b: Pick<Booking, "date" | "start" | "end" | "roomId">) => !!a.roomId && a.roomId === b.roomId && a.date === b.date && a.start < b.end && a.end > b.start;
export function placeEvents(events: Booking[]) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const groups: Booking[][] = [];
  let latestEnd = "";
  for (const event of sorted) {
    if (!groups.length || event.start >= latestEnd) { groups.push([]); latestEnd = ""; }
    groups[groups.length - 1].push(event);
    if (event.end > latestEnd) latestEnd = event.end;
  }
  return groups.flatMap(group => {
    const ends: string[] = [];
    const positioned = group.map(event => {
      let lane = ends.findIndex(end => end <= event.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = event.end;
      return { event, lane };
    });
    return positioned.map(item => ({ ...item, lanes: ends.length }));
  });
}
export function createICS(events: Booking[], rooms: Room[], now = new Date()) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Realess//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const event of events) lines.push("BEGIN:VEVENT", `UID:${event.id}@agenda.realess`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(new Date(`${event.date}T${event.start}:00-03:00`))}`, `DTEND:${stamp(new Date(`${event.date}T${event.end}:00-03:00`))}`, `SUMMARY:${esc(event.title)}`, `DESCRIPTION:${esc([event.description, event.link].filter(Boolean).join("\n"))}`, `LOCATION:${esc(rooms.find(r => r.id === event.roomId)?.name || "Online / sem sala")}`, "END:VEVENT");
  lines.push("END:VCALENDAR");
  const encoder = new TextEncoder();
  return lines.flatMap(line => {
    const folded: string[] = []; let current = "";
    for (const char of line) { if (encoder.encode(current + char).length > 75) { folded.push(current); current = " "; } current += char; }
    folded.push(current); return folded;
  }).join("\r\n") + "\r\n";
}
