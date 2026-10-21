const parseDay = (date: string) => new Date(`${date}T12:00:00Z`);
const addDays = (date: string, amount: number) => {
  const result = parseDay(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
};

export type Holiday = {
  date: string;
  name: string;
  kind: "holiday" | "optional" | "exception";
  scope: "nacional" | "estadual" | "municipal" | "empresa";
  source: string;
  blocked: boolean;
  note?: string;
};
export type CalendarPolicy = {
  blockOptional: boolean;
  overrides: { date: string; allowBooking: boolean; note: string }[];
};
export type HolidayYear = {
  year: number;
  holidays: Holiday[];
  state: "fresh" | "stale" | "rules";
  checkedAt: number;
  source: string;
  policy: CalendarPolicy;
  isAdmin: boolean;
};
export const STATE_SOURCE = "https://leis.alesc.sc.gov.br/ato-normativo/21721";
export const NATIONAL_SOURCE =
  "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm";
export const citySource = (year: number) =>
  `https://www.joinville.sc.gov.br/publicacoes/calendario-de-feriados-e-pontos-facultativos-do-municipio-de-joinville-${year}/`;
export const DEFAULT_POLICY: CalendarPolicy = {
  blockOptional: false,
  overrides: [],
};
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function easter(year: number) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4;
  const f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function baseHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];
  const add = (
    date: string,
    name: string,
    scope: Holiday["scope"],
    kind: Holiday["kind"] = "holiday",
    source = scope === "estadual"
      ? STATE_SOURCE
      : scope === "nacional"
        ? NATIONAL_SOURCE
        : citySource(year),
  ) =>
    holidays.push({
      date,
      name,
      scope,
      kind,
      source,
      blocked: kind === "holiday",
    });
  for (const [date, name] of [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalhador"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["12-25", "Natal"],
  ])
    add(`${year}-${date}`, name, "nacional");
  if (year >= 2024)
    add(
      `${year}-11-20`,
      "Dia Nacional de Zumbi e da Consciência Negra",
      "nacional",
      "holiday",
      "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm",
    );
  const pascoa = easter(year);
  add(addDays(pascoa, -2), "Sexta-feira da Paixão", "municipal");
  add(addDays(pascoa, 60), "Corpus Christi", "municipal");
  add(`${year}-03-09`, "Aniversário de Joinville", "municipal");
  add(
    addDays(pascoa, -48),
    "Carnaval (segunda-feira)",
    "municipal",
    "optional",
  );
  add(addDays(pascoa, -47), "Carnaval (terça-feira)", "municipal", "optional");
  for (const [monthDay, name] of [
    ["08-11", "Dia do Estado de Santa Catarina"],
    ["11-25", "Santa Catarina de Alexandria"],
  ]) {
    const original = `${year}-${monthDay}`,
      weekday = parseDay(original).getUTCDay();
    const date =
      weekday > 0 && weekday < 6 ? addDays(original, 7 - weekday) : original;
    add(
      date,
      name +
        (date !== original
          ? ` (transferido de ${monthDay.slice(3)}/${monthDay.slice(0, 2)})`
          : ""),
      "estadual",
    );
  }
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
export function parseCityCalendar(html: string, year: number): Holiday[] {
  const result: Holiday[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
    ].map((match) => plain(match[1]));
    const index = cells.findIndex((cell) => /^\d{2}\/\d{2}$/.test(cell));
    if (index < 0) continue;
    const [day, month] = cells[index].split("/"),
      date = `${year}-${month}-${day}`;
    const type = cells[index + 1] || "",
      name = cells[index + 2] || "";
    if (
      !validDate(date) ||
      !name ||
      !/^Feriado$|^Ponto Facultativo$/i.test(type)
    )
      continue;
    const known = baseHolidays(year).find(
      (item) => item.date === date && item.kind === "holiday",
    );
    result.push({
      date,
      name,
      kind: /ponto/i.test(type) ? "optional" : "holiday",
      scope: known?.scope || "municipal",
      source: citySource(year),
      blocked: !/^Ponto/i.test(type),
    });
  }
  if (
    result.filter((item) => item.kind === "holiday").length < 8 ||
    !result.some((item) => item.date === `${year}-03-09`)
  )
    throw new Error("Calendário municipal incompleto");
  return result;
}
export function mergeHolidays(year: number, city: Holiday[]): Holiday[] {
  const result = baseHolidays(year);
  for (const entry of city) {
    const index = result.findIndex(
      (item) => item.date === entry.date && item.kind === entry.kind,
    );
    if (index >= 0) result[index] = entry;
    else result.push(entry);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function applyPolicy(
  holidays: Holiday[],
  policy: CalendarPolicy,
): Holiday[] {
  const result = holidays.map((item) => ({
    ...item,
    blocked: item.kind === "holiday" || policy.blockOptional,
  }));
  for (const override of policy.overrides) {
    const entries = result.filter((item) => item.date === override.date);
    if (entries.length)
      entries.forEach((item) => {
        item.blocked = !override.allowBooking;
        item.note = override.note;
      });
    else
      result.push({
        date: override.date,
        name: override.allowBooking
          ? "Exceção autorizada"
          : "Dia não útil da empresa",
        scope: "empresa",
        kind: "exception",
        source: "Configuração administrativa",
        blocked: !override.allowBooking,
        note: override.note,
      });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function blockedHoliday(date: string, holidays: Holiday[]) {
  return holidays.find((item) => item.date === date && item.blocked);
}
export const holidayMessage = (holiday: Holiday) =>
  holiday.kind === "optional"
    ? `Não é possível agendar reuniões nesta data: ${holiday.name} foi configurado como ponto facultativo não útil.`
    : holiday.kind === "exception"
      ? `Não é possível agendar reuniões nesta data: ${holiday.name}.`
      : `Não é possível agendar reuniões nesta data, pois é feriado: ${holiday.name}.`;
