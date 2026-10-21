import { env } from "cloudflare:workers";
import {
  applyPolicy,
  baseHolidays,
  citySource,
  mergeHolidays,
  parseCityCalendar,
  type CalendarPolicy,
  type Holiday,
  type HolidayYear,
} from "./holidays";

export function isCalendarAdmin(user: { isAdmin?: boolean }) {
  return user.isAdmin === true;
}
export function configuredCalendarAdmin(email: string) {
  return (env.AGENDA_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
export async function readCalendarPolicy(): Promise<CalendarPolicy> {
  const [settings, overrides] = await env.DB!.batch([
    env.DB!.prepare(
      "SELECT block_optional FROM calendar_policy WHERE id='workspace'",
    ),
    env.DB!.prepare(
      "SELECT date,allow_booking,note FROM holiday_overrides ORDER BY date",
    ),
  ]);
  return {
    blockOptional: !!(settings.results[0] as { block_optional?: number })
      ?.block_optional,
    overrides: (
      overrides.results as {
        date: string;
        allow_booking: number;
        note: string;
      }[]
    ).map((item) => ({
      date: item.date,
      allowBooking: !!item.allow_booking,
      note: item.note,
    })),
  };
}
export async function getHolidayYear(
  year: number,
  admin = false,
): Promise<HolidayYear> {
  const db = env.DB!,
    policy = await readCalendarPolicy();
  const cached = await db
    .prepare("SELECT payload,checked_at,state FROM holiday_cache WHERE year=?")
    .bind(year)
    .first<{ payload: string; checked_at: number; state: string }>();
  let holidays = baseHolidays(year),
    state: HolidayYear["state"] = "rules",
    checkedAt = Date.now();
  if (cached) {
    try {
      holidays = mergeHolidays(year, JSON.parse(cached.payload));
      state = cached.state === "fresh" ? "fresh" : "stale";
    } catch {
      /* A corrupt cache never removes the validated recurring rules. */
    }
  }
  const ttl = cached?.state === "fresh" ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
  if (cached && Date.now() - cached.checked_at < ttl)
    checkedAt = cached.checked_at;
  else {
    try {
      const response = await fetch(citySource(year), {
        signal: AbortSignal.timeout(4000),
        headers: { Accept: "text/html" },
      });
      if (!response.ok) throw new Error("Fonte municipal indisponível");
      const city = parseCityCalendar(await response.text(), year);
      holidays = mergeHolidays(year, city);
      state = "fresh";
      await db
        .prepare(
          "INSERT INTO holiday_cache(year,payload,checked_at,state) VALUES(?,?,?,'fresh') ON CONFLICT(year) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at,state=excluded.state",
        )
        .bind(year, JSON.stringify(city), checkedAt)
        .run();
    } catch {
      state = cached ? "stale" : "rules";
      await db
        .prepare(
          "INSERT INTO holiday_cache(year,payload,checked_at,state) VALUES(?,?,?,?) ON CONFLICT(year) DO UPDATE SET checked_at=excluded.checked_at,state=excluded.state",
        )
        .bind(year, "[]", checkedAt, state)
        .run();
    }
  }
  return {
    year,
    holidays: applyPolicy(holidays, policy),
    state,
    checkedAt,
    source: citySource(year),
    policy,
    isAdmin: admin,
  };
}
