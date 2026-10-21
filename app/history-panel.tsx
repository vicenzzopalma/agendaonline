"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  bookingStatus,
  dateKey,
  TZ,
  type Booking,
  type Room,
} from "../lib/calendar";

export function HistoryPanel({
  rooms,
  onSelect,
  revision = 0,
}: {
  rooms: Room[];
  onSelect: (event: Booking) => void;
  revision?: number;
}) {
  const [query, setQuery] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [room, setRoom] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [results, setResults] = useState<Booking[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          mode: "history",
          q: query,
          from,
          to,
          status,
          page: String(page),
        });
        if (room) params.set("room", room);
        const response = await fetch(`/api/workspace?${params}`, { signal }),
          body = (await response.json()) as {
            error?: string;
            bookings: Booking[];
            total: number;
            history: { action: string; recordedAt: number; snapshot: string }[];
          };
        if (!response.ok) throw new Error(body.error);
        setResults(body.bookings);
        setTotal(body.total);
      } catch (reason) {
        if (!(reason instanceof Error && reason.name === "AbortError"))
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível pesquisar.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query, from, to, room, status, page],
  );
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => void load(controller.signal), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, revision]);
  useEffect(() => {
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);
  const today = dateKey(new Date()),
    time = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  return (
    <section className="history-panel" aria-label="Histórico de compromissos">
      <header>
        <h2>Histórico permanente</h2>
        <p>
          Pesquise reuniões de qualquer mês ou ano, incluindo cancelamentos.
        </p>
      </header>
      <div className="history-filters">
        <label className="history-query">
          Título, responsável ou participante
          <div>
            <Search size={17} />
            <input
              type="search"
              value={query}
              maxLength={120}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Ex.: Reunião Financeiro"
            />
          </div>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Sala
          <select
            value={room}
            onChange={(event) => {
              setRoom(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as salas</option>
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {!item.active ? " (arquivada)" : ""}
              </option>
            ))}
            <option value="online">Sem sala de reunião</option>
          </select>
        </label>
        <label>
          Situação
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas</option>
            <option value="active">Não cancelados</option>
            <option value="future">Agendados</option>
            <option value="past">Realizados</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </label>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setQuery("");
            setFrom("");
            setTo("");
            setRoom("");
            setStatus("all");
            setPage(1);
          }}
        >
          Limpar pesquisa
        </button>
      </div>
      <div className="history-results" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="history-notice">Pesquisando o histórico…</p>
        ) : error ? (
          <div className="form-error" role="alert">
            {error}
            <button
              type="button"
              className="text-button"
              onClick={() => void load()}
            >
              Tentar novamente
            </button>
          </div>
        ) : results.length ? (
          results.map((event) => (
            <button
              type="button"
              className={`history-result ${event.status === "cancelled" ? "is-cancelled" : ""}`}
              key={event.id}
              onClick={() => onSelect(event)}
            >
              <span className="history-result-date">
                {event.date.split("-").reverse().join("/")}
                <small>
                  {event.start} – {event.end}
                </small>
              </span>
              <span>
                <strong>{event.title}</strong>
                <small>
                  {rooms.find((item) => item.id === event.roomId)?.name ||
                    "Sem sala de reunião"}{" "}
                  · {event.ownerName}
                </small>
              </span>
              <span
                className={`booking-status status-${event.status === "cancelled" ? "cancelled" : bookingStatus(event, today, time) === "Realizado" ? "past" : "future"}`}
              >
                {bookingStatus(event, today, time)}
              </span>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <p className="history-notice">
            Nenhum compromisso encontrado para esta pesquisa.
          </p>
        )}
      </div>
      <footer className="history-pagination">
        <span>
          {total} registros · página {page} de{" "}
          {Math.max(1, Math.ceil(total / 30))}
        </span>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Página anterior"
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Próxima página"
            disabled={page * 30 >= total || loading}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </section>
  );
}

export function BookingAudit({ bookingId }: { bookingId: string }) {
  const [records, setRecords] = useState<
      { action: string; recordedAt: number; snapshot: string }[] | null
    >(null),
    [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<number | null>(null),
    [loading, setLoading] = useState(false);
  async function load(append = false) {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
          `/api/workspace?audit=${encodeURIComponent(bookingId)}${append && nextCursor ? `&before=${nextCursor}` : ""}`,
        ),
        body = (await response.json()) as {
          error?: string;
          bookings: Booking[];
          total: number;
          history: { action: string; recordedAt: number; snapshot: string }[];
          nextCursor: number | null;
        };
      if (!response.ok) throw new Error(body.error);
      setRecords((previous) =>
        append ? [...(previous || []), ...body.history] : body.history,
      );
      setNextCursor(body.nextCursor);
    } catch {
      setError("Não foi possível consultar as alterações.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="booking-audit"
      onToggle={(event) => {
        if (event.currentTarget.open && records === null && !loading)
          void load();
      }}
    >
      <summary>Histórico de alterações</summary>
      {error ? (
        <p role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => void load()}
          >
            Tentar novamente
          </button>
        </p>
      ) : records ? (
        records.map((record, index) => {
          const snapshot = JSON.parse(record.snapshot);
          return (
            <div className="audit-entry" key={index}>
              <strong>
                {{
                  created: "Criado",
                  updated: "Alterado",
                  cancelled: "Cancelado",
                  imported: "Registro preservado",
                }[record.action] || record.action}
              </strong>
              <time>
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone: TZ,
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(record.recordedAt))}
              </time>
              <span>
                {snapshot.title} ·{" "}
                {snapshot.date?.split("-").reverse().join("/")} ·{" "}
                {snapshot.start} – {snapshot.end}
              </span>
              {snapshot.description && <p>{snapshot.description}</p>}
            </div>
          );
        })
      ) : (
        <p>Carregando alterações…</p>
      )}
      {nextCursor && (
        <button
          type="button"
          className="text-button"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "Carregando…" : "Carregar alterações anteriores"}
        </button>
      )}
    </details>
  );
}
