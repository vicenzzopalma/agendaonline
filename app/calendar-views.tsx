"use client";

import { useRef, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { HolidayNotice } from "./holiday-indicator";
import { blockedHoliday, holidayMessage, type Holiday } from "../lib/holidays";
import {
  addDays,
  dateKey,
  monday,
  parseDay,
  TZ,
  type Booking,
  bookingStatus,
} from "../lib/calendar";

const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: TZ }).format(
    parseDay(day),
  );

export function nextMonth(day: string, amount: number) {
  const date = parseDay(`${day.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateKey(date);
}

function useDateKeys(onSelect: (day: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (offset === undefined && event.key !== "Home" && event.key !== "End")
      return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? monday(day)
        : event.key === "End"
          ? addDays(monday(day), 6)
          : addDays(day, offset!);
    onSelect(target);
    requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)
        ?.focus(),
    );
  }
  return { ref, onKeyDown };
}

export function MiniCalendar({
  month,
  selected,
  today,
  events,
  onMonth,
  onSelect,
  holidays,
}: {
  month: string;
  selected: string;
  today: string;
  events: Booking[];
  onMonth: (day: string) => void;
  onSelect: (day: string) => void;
  holidays: Holiday[];
}) {
  const start = monday(month);
  const count = addDays(start, 35) >= nextMonth(month, 1) ? 35 : 42;
  const keys = useDateKeys((day) => {
    onMonth(`${day.slice(0, 7)}-01`);
    onSelect(day);
  });
  return (
    <section className="mini-calendar" aria-label="Selecionar data">
      <header>
        <strong>{format(month, { month: "long", year: "numeric" })}</strong>
        <div>
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => onMonth(nextMonth(month, -1))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => onMonth(nextMonth(month, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <div className="mini-grid" ref={keys.ref}>
        {["S", "T", "Q", "Q", "S", "S", "D"].map((day, index) => (
          <span className="mini-weekday" key={index}>
            {day}
          </span>
        ))}
        {Array.from({ length: count }, (_, index) => {
          const day = addDays(start, index);
          const total = events.filter((event) => event.date === day).length;
          const holiday = holidays.find((item) => item.date === day);
          return (
            <button
              type="button"
              key={day}
              data-date={day}
              onKeyDown={(event) => keys.onKeyDown(event, day)}
              aria-label={`${format(day, { day: "numeric", month: "long" })}${total ? `, ${total} compromissos` : ""}`}
              aria-pressed={day === selected}
              aria-current={day === today ? "date" : undefined}
              title={
                holiday
                  ? `${holiday.name} · ${holiday.kind === "optional" ? "Ponto facultativo" : "Feriado"}`
                  : undefined
              }
              className={`${day.slice(0, 7) !== month.slice(0, 7) ? "other-month" : ""} ${day === selected ? "mini-selected" : ""} ${day === today ? "mini-today" : ""}`}
              onClick={() => onSelect(day)}
            >
              {parseDay(day).getUTCDate()}
              {total > 0 && <span />}
              {holiday && (
                <i
                  className={`mini-holiday-marker ${holiday.kind === "optional" ? "optional-marker" : ""}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MonthView({
  anchor,
  today,
  events,
  eventColor,
  eventLocation,
  onEvent,
  onDay,
  onCreate,
  holidays,
}: {
  anchor: string;
  today: string;
  events: Booking[];
  eventColor: (event: Booking) => string;
  eventLocation: (event: Booking) => string;
  onEvent: (event: Booking) => void;
  onDay: (day: string) => void;
  onCreate: (day: string) => void;
  holidays: Holiday[];
}) {
  const first = `${anchor.slice(0, 7)}-01`;
  const start = monday(first);
  const last = addDays(nextMonth(anchor, 1), -1);
  const count = addDays(start, 35) > last ? 35 : 42;
  const keys = useDateKeys(onDay);
  const ordered = [...events].sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
  const selectedEvents = ordered.filter((event) => event.date === anchor);
  const currentTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return (
    <div className="month-view">
      <div
        className="month-calendar"
        ref={keys.ref}
        role="group"
        aria-label="Calendário mensal"
      >
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
          <div className="month-weekday" key={day}>
            {day}
          </div>
        ))}
        {Array.from({ length: count }, (_, index) => {
          const day = addDays(start, index);
          const dayEvents = ordered.filter((event) => event.date === day);
          const holiday = holidays.find((item) => item.date === day);
          return (
            <div
              className={`month-day ${day.slice(0, 7) !== anchor.slice(0, 7) ? "other-month" : ""} ${day === anchor ? "selected-day" : ""}`}
              key={day}
              data-holiday={holiday?.kind}
            >
              <button
                type="button"
                className={`month-day-number ${day === today ? "is-today" : ""}`}
                data-date={day}
                title={
                  holidays
                    .filter((item) => item.date === day)
                    .map(
                      (item) =>
                        `${item.name} · ${item.kind === "optional" ? "Ponto facultativo" : "Feriado"}`,
                    )
                    .join(" · ") || undefined
                }
                onClick={() => onDay(day)}
                onKeyDown={(event) => keys.onKeyDown(event, day)}
                aria-pressed={day === anchor}
                aria-current={day === today ? "date" : undefined}
                aria-label={`${format(day, { weekday: "long", day: "numeric", month: "long" })}, ${dayEvents.length} compromissos${holiday ? `, ${holiday.name}` : ""}`}
              >
                <span>
                  {parseDay(day).getUTCDate()}
                  {holiday && (
                    <i
                      className={`holiday-marker ${holiday.kind === "optional" ? "optional-marker" : ""}`}
                    />
                  )}
                </span>
                <span
                  className={`month-day-count ${dayEvents.length ? "has-events" : ""}`}
                  aria-hidden="true"
                >
                  {dayEvents.length || "·"}
                </span>
              </button>
              <div className="month-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    type="button"
                    className={`month-event color-${eventColor(event)} ${event.status === "cancelled" ? "is-cancelled" : bookingStatus(event, today, currentTime) === "Realizado" ? "event-past" : "event-future"}`}
                    key={event.id}
                    onClick={() => onEvent(event)}
                  >
                    <span>{event.start}</span>
                    <strong>{event.title}</strong>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    type="button"
                    className="month-more"
                    onClick={() => onDay(day)}
                  >
                    Ver mais {dayEvents.length - 3}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <section
        className="selected-day-agenda"
        aria-label="Compromissos do dia selecionado"
      >
        <header>
          <div>
            <span className="eyebrow">DIA SELECIONADO</span>
            <h3>
              {format(anchor, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onCreate(anchor)}
            disabled={!!blockedHoliday(anchor, holidays)}
            title={
              blockedHoliday(anchor, holidays)
                ? holidayMessage(blockedHoliday(anchor, holidays)!)
                : undefined
            }
          >
            <Plus size={16} />
            Adicionar compromisso
          </button>
        </header>
        <HolidayNotice date={anchor} holidays={holidays} />
        <p className="selected-day-total" role="status">
          {selectedEvents.length}{" "}
          {selectedEvents.length === 1 ? "compromisso" : "compromissos"}
        </p>
        <div
          className="selected-day-events"
          tabIndex={0}
          role="region"
          aria-label="Lista de compromissos do dia"
        >
          {selectedEvents.length ? (
            selectedEvents.map((event) => (
              <button
                type="button"
                className={`selected-day-event color-${eventColor(event)} ${event.status === "cancelled" ? "is-cancelled" : bookingStatus(event, today, currentTime) === "Realizado" ? "event-past" : "event-future"}`}
                key={event.id}
                onClick={() => onEvent(event)}
              >
                <span className="selected-event-time">
                  {event.start} – {event.end}
                </span>
                <span>
                  <strong>{event.title}</strong>
                  <small>
                    {eventLocation(event)} · {event.ownerName} ·{" "}
                    {bookingStatus(event, today, currentTime)}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <p className="selected-day-empty">
              <CalendarDays size={18} />
              Nenhum compromisso neste dia.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
