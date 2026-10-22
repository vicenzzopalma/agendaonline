"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  DoorOpen,
  Clock3,
  Users,
  ArrowUpRight,
  Check,
  Video,
  X,
  MapPin,
  Download,
  List,
  LayoutGrid,
  CircleHelp,
  Menu,
  ArrowRight,
  Sparkles,
  Pencil,
  Trash2,
  LoaderCircle,
  CalendarCheck2,
  Building2,
  CheckCircle2,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  addDays,
  bookingLocation,
  bookingStatus,
  createICS,
  dateKey,
  minutes,
  monday,
  overlaps,
  parseDay,
  placeEvents,
  toTime,
  TZ,
  type Booking,
  type Room,
} from "../lib/calendar";

import { MeetingLinkField, MeetingLinkDetail } from "./meeting-link";
import { MiniCalendar, MonthView, nextMonth } from "./calendar-views";
import { Modal } from "./modal";
import { useHolidays } from "../hooks/use-holidays";
import { blockedHoliday, holidayMessage, type Holiday } from "../lib/holidays";
import { HolidayNotice, HolidayToolbar } from "./holiday-indicator";
import { CalendarPolicyDialog } from "./calendar-policy";
import { HistoryPanel, BookingAudit } from "./history-panel";
import { useNavigationDrawer } from "../hooks/use-navigation-drawer";
import { RecipientsField } from "./recipients-field";
import { InvitationDialog } from "./invitation-dialog";
import {
  normalizeRecipients,
  splitRecipients,
  validEmail,
} from "../lib/recipients";

type User = { id: string; name: string; email: string; isAdmin?: boolean };
type Data = {
  rooms: Room[];
  bookings: Booking[];
  started: boolean;
  todayBookings?: Booking[];
  upcoming?: Booking[];
  stats?: { week: number; mine: number };
  user: User | null;
  authenticated?: boolean;
};
type Draft = {
  id?: string;
  version?: number;
  title: string;
  date: string;
  start: string;
  end: string;
  roomId: string;
  kind: string;
  description: string;
  participants: string;
  link: string;
  organizerName: string;
  organizerEmail: string;
};
type RoomDraft = {
  id?: string;
  name: string;
  capacity: number;
  location: string;
  equipment: string;
  color: string;
};
const colorNames: Record<string, string> = {
  green: "Azul Realess",
  blue: "Dourado Realess",
  purple: "Azul acinzentado",
  orange: "Areia",
  teal: "Verde-petróleo",
  rose: "Rosa",
  indigo: "Índigo",
  red: "Vermelho",
  cyan: "Turquesa",
  lime: "Verde-lima",
  slate: "Cinza-azulado",
  brown: "Marrom",
};
const kinds: Record<string, string> = {
  appointment: "Compromisso",
  meeting: "Reunião interna",
  client: "Reunião com cliente",
  focus: "Tempo de foco",
  online: "Reunião online",
};
const fmt = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: TZ }).format(
    parseDay(day),
  );
const initials = (name: string) =>
  name
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

export default function Workspace() {
  const [now, setNow] = useState(new Date());
  const today = dateKey(now);
  const currentTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [anchor, setAnchor] = useState(today);
  const [miniMonth, setMiniMonth] = useState(today.slice(0, 7) + "-01");
  const [tab, setTab] = useState<"calendar" | "rooms" | "mine" | "history">(
    "calendar",
  );
  const [view, setView] = useState<"week" | "month" | "list">("week");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [legacyRecipients, setLegacyRecipients] = useState<string[]>([]);
  const [invitation, setInvitation] = useState<Booking | null>(null);
  const [removedInvitation, setRemovedInvitation] = useState<Booking | null>(
    null,
  );
  const [removedOnly, setRemovedOnly] = useState(false);
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null);
  const [help, setHelp] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [showAudit, setShowAudit] = useState(false);
  const holidayData = useHolidays([
    Number(anchor.slice(0, 4)),
    Number(miniMonth.slice(0, 4)),
    Number(draft?.date.slice(0, 4) || anchor.slice(0, 4)),
  ]);
  const holidays = holidayData.holidays;
  const loadFrom = addDays(anchor.slice(0, 7) + "-01", -7),
    loadTo = addDays(nextMonth(anchor, 1), 7);
  const requestSequence = useRef(0);
  const [confirm, setConfirm] = useState<{
    type: "booking" | "room";
    id: string;
    name: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { panelRef, mainRef } = useNavigationDrawer(sidebar, () =>
    setSidebar(false),
  );
  const refresh = useCallback(
    async (silent = false) => {
      const sequence = ++requestSequence.current;
      if (!silent) setLoading(true);
      try {
        const response = await fetch(
          `/api/workspace?from=${loadFrom}&to=${loadTo}&includeCancelled=${showCancelled ? 1 : 0}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as Data & {
          error?: string;
        };
        if (sequence !== requestSequence.current) return;
        if (!response.ok) {
          throw new Error(body.error || "Não foi possível carregar a agenda.");
        }
        setData(body);
        setLoadError("");
      } catch (error) {
        if (!silent && sequence === requestSequence.current)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a agenda.",
          );
      } finally {
        if (!silent && sequence === requestSequence.current) setLoading(false);
      }
    },
    [loadFrom, loadTo, showCancelled],
  );
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      setNow(new Date());
      void refresh(true);
    }, 30000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const rooms = data?.rooms || [];
  const activeRooms = rooms.filter((r) => !!r.active);
  const events = data?.bookings || [];
  const activeEvents = events.filter((event) => event.status !== "cancelled");
  const filtered = events.filter(
    (e) =>
      (!search ||
        `${e.title} ${e.ownerName} ${e.participants} ${rooms.find((r) => r.id === e.roomId)?.name || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))) &&
      (!roomFilter.length || roomFilter.includes(e.roomId || "online")) &&
      (!kindFilter || e.kind === kindFilter) &&
      (tab !== "mine" || e.ownerId === data?.user?.id),
  );
  const weekStart = view === "week" ? anchor : monday(anchor);
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const rangeStart = view === "month" ? anchor.slice(0, 7) + "-01" : weekStart;
  const rangeEnd =
    view === "month"
      ? addDays(nextMonth(anchor, 1), -1)
      : addDays(weekStart, 4);
  const rangeEvents = filtered
    .filter((e) => e.date >= rangeStart && e.date <= rangeEnd)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  const weekEvents = activeEvents.filter(
    (e) => e.date >= weekStart && e.date <= addDays(weekStart, 4),
  );
  const todayEvents = (data?.todayBookings || activeEvents)
    .filter((e) => e.date === today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const busy = (roomId: string) =>
    (data?.todayBookings || activeEvents).find(
      (e) =>
        e.roomId === roomId &&
        e.date === today &&
        e.start <= currentTime &&
        e.end > currentTime,
    );
  const upcoming = (data?.upcoming || activeEvents)
    .filter((e) => e.date > today)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    )
    .slice(0, 4);
  const roomById = (id: string | null) => rooms.find((r) => r.id === id);
  const eventColor = (event: Booking) =>
    roomById(event.roomId)?.color ||
    (event.kind === "focus" ? "purple" : "green");
  const eventLocation = (event: Booking) => bookingLocation(event, rooms);
  const changeAnchor = (day: string) => {
    const holiday = blockedHoliday(day, holidays);
    if (holiday) setToast(holidayMessage(holiday));
    setAnchor(day);
    setMiniMonth(day.slice(0, 7) + "-01");
  };
  const switchTab = (value: typeof tab) => {
    setTab(value);
    setSidebar(false);
    setSearch("");
    if (value === "mine") setView("list");
  };
  const toggleRoom = (id: string) =>
    setRoomFilter((previous) =>
      previous.includes(id)
        ? previous.filter((r) => r !== id)
        : [...previous, id],
    );
  function newBooking(day = anchor, start?: string, roomId = "") {
    setLegacyRecipients([]);
    if (!start) {
      if (day === today && minutes(currentTime) < 23 * 60)
        start = toTime(Math.ceil(minutes(currentTime) / 30) * 30);
      else {
        if (day === today) day = addDays(today, 1);
        start = "09:00";
      }
    }
    setSidebar(false);
    const holiday = blockedHoliday(day, holidays);
    if (holiday) {
      setToast(holidayMessage(holiday));
      return;
    }
    setFormError("");
    setDraft({
      title: "",
      date: day,
      start,
      end: toTime(Math.min(minutes(start) + 60, 1439)),
      roomId,
      kind: roomId ? "meeting" : "appointment",
      description: "",
      participants: "",
      link: "",
      organizerName:
        data?.user?.name === "Visitante" ? "" : data?.user?.name || "",
      organizerEmail: data?.user?.email || "",
    });
  }
  async function mutate(payload: Record<string, unknown>, message: string) {
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        id?: string;
        booking?: Booking;
        removedInvitation?: Booking;
      };
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      await refresh(true);
      setHistoryRevision((value) => value + 1);
      setToast(message);
      return result;
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Tente novamente.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  function editBooking(event: Booking) {
    setLegacyRecipients(
      splitRecipients(event.participants).filter((part) => !validEmail(part)),
    );
    setSelected(null); setShowAudit(false);
    setFormError("");
    setDraft({
      id: event.demo ? undefined : event.id,
      version: event.version,
      title: event.title,
      date: event.date,
      start: event.start,
      end: event.end,
      roomId: event.roomId || "",
      kind: event.kind,
      description: event.demo ? "" : event.description,
      participants: event.demo ? "" : event.participants,
      link: event.link,
      organizerName: event.demo ? data?.user?.name || "" : event.ownerName,
      organizerEmail: event.organizerEmail || data?.user?.email || "",
    });
  }
  async function copyMeetingLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link da reunião copiado.");
    } catch {
      setToast(
        "Não foi possível copiar. Você pode selecionar e copiar o endereço da reunião.",
      );
    }
  }
  const saveBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    let participants: string;
    try {
      const pending = new FormData(e.currentTarget as HTMLFormElement).get(
        "participantPending",
      );
      participants = normalizeRecipients(
        [draft.participants, typeof pending === "string" ? pending : ""]
          .filter(Boolean)
          .join(", "),
        legacyRecipients,
      );
    } catch (error) {
      setFormError((error as Error).message);
      return;
    }
    if (draftHoliday) {
      setFormError(holidayMessage(draftHoliday));
      return;
    }
    const result = await mutate(
      { action: "saveBooking", ...draft, participants },
      draft?.id ? "Compromisso atualizado." : "Compromisso criado na agenda.",
    );
    if (result) {
      if (draft) changeAnchor(draft.date);
      setDraft(null);
      setRemovedInvitation(result.removedInvitation || null);
      setRemovedOnly(
        !result.booking?.participants && !!result.removedInvitation,
      );
      if (result.booking?.participants) setInvitation(result.booking);
      else if (result.removedInvitation)
        setInvitation(result.removedInvitation);
    }
  };
  const saveRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (
      await mutate(
        { action: "saveRoom", ...roomDraft },
        "Sala salva com sucesso.",
      )
    )
      setRoomDraft(null);
  };
  function download(eventsToExport = rangeEvents) {
    if (!eventsToExport.length) {
      setToast("Não há compromissos neste período para exportar.");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([createICS(eventsToExport, rooms)], {
        type: "text/calendar;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "realess-agenda.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(
      "Agenda exportada. Importe o arquivo no Outlook ou Google Agenda.",
    );
  }
  const draftHoliday = draft ? blockedHoliday(draft.date, holidays) : undefined;
  const draftConflict =
    draft &&
    data?.bookings.find(
      (e) =>
        e.id !== draft.id &&
        overlaps({ ...draft, roomId: draft.roomId || null }, e),
    );
  const periodLabel =
    view === "month"
      ? fmt(anchor, { month: "long", year: "numeric" })
      : `${fmt(weekStart, { day: "2-digit" })} – ${fmt(addDays(weekStart, 4), { day: "2-digit", month: "short", year: "numeric" }).replace(" de ", " ").replace(" de ", " ")}`;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para a agenda
      </a>
      {sidebar && (
        <div
          className="sidebar-overlay"
          aria-hidden="true"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        ref={panelRef}
        id="main-navigation"
        className={`sidebar ${sidebar ? "is-open" : ""}`}
        aria-label="Menu principal"
        role={sidebar ? "dialog" : undefined}
        aria-modal={sidebar ? true : undefined}
      >
        <div className="drawer-header">
          <strong>Menu Realess</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar menu"
            onClick={() => setSidebar(false)}
          >
            <X size={20} />
          </button>
        </div>
        <a href="/" className="brand" aria-label="Realess início">
          <img
            className="brand-logo"
            src="/realess-logo-hd.png"
            alt="Realess · Cobranças Empresariais"
            width={1080}
            height={1080}
          />
        </a>
        <div className="workspace-badge">
          <div className="workspace-icon">
            <Building2 size={18} />
          </div>
          <div>
            <strong>Workspace Realess</strong>
            <span>Juntos, no mesmo ritmo</span>
          </div>
          <span className="workspace-online" />
        </div>
        <div className="nav-label">SEU ESPAÇO DE TRABALHO</div>
        <nav aria-label="Navegação principal">
          <button
            className={`nav-item ${tab === "calendar" ? "active" : ""}`}
            onClick={() => switchTab("calendar")}
          >
            <CalendarDays size={19} />
            Agenda
            <span className="nav-active-dot" />
          </button>
          <button
            className={`nav-item ${tab === "rooms" ? "active" : ""}`}
            onClick={() => switchTab("rooms")}
          >
            <DoorOpen size={19} />
            Salas de reunião
            <span className="nav-count">{activeRooms.length || "–"}</span>
          </button>
          <button
            className={`nav-item ${tab === "mine" ? "active" : ""}`}
            onClick={() => switchTab("mine")}
          >
            <CalendarCheck2 size={19} />
            Meus compromissos
          </button>
          <button
            className={`nav-item ${tab === "history" ? "active" : ""}`}
            onClick={() => switchTab("history")}
          >
            <Search size={19} />
            Histórico
          </button>
        </nav>
        <MiniCalendar
          month={miniMonth}
          selected={anchor}
          today={today}
          events={events}
          holidays={holidays}
          onMonth={setMiniMonth}
          onSelect={(day) => {
            changeAnchor(day);
            setTab("calendar");
            setSearch("");
          }}
        />
        <div className="nav-label room-nav-label">
          FILTRAR A AGENDA
          <button
            className="sidebar-small-button"
            aria-label="Adicionar sala"
            onClick={() => {
              setSidebar(false);
              setFormError("");
              setRoomDraft({
                name: "",
                capacity: 0,
                location: "",
                equipment: "",
                color: "green",
              });
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="room-filters">
          {activeRooms.map((room) => (
            <button
              key={room.id}
              className={`room-filter ${roomFilter.includes(room.id) ? "checked" : ""}`}
              onClick={() => toggleRoom(room.id)}
              aria-pressed={roomFilter.includes(room.id)}
            >
              <span className={`room-check color-${room.color}`}>
                {(!roomFilter.length || roomFilter.includes(room.id)) && (
                  <Check size={10} />
                )}
              </span>
              {room.name}
              <span className="room-capacity">{room.capacity || ""}</span>
            </button>
          ))}
          <button
            className={`room-filter ${roomFilter.includes("online") ? "checked" : ""}`}
            aria-pressed={roomFilter.includes("online")}
            onClick={() => toggleRoom("online")}
          >
            <span className="room-check color-gray">
              {(!roomFilter.length || roomFilter.includes("online")) && (
                <Check size={10} />
              )}
            </span>
            Sem sala de reunião
            <CalendarDays size={13} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>Um dia de cada vez.</strong>
            <p>Organize prioridades e cuide do seu tempo.</p>
            <button onClick={() => newBooking()}>
              Adicionar compromisso <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="help-button"
            onClick={() => {
              setSidebar(false);
              setHelp(true);
            }}
          >
            <CircleHelp size={17} />
            Ajuda e informações
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            REALESS <span>FEITO PARA CONECTAR</span>
          </div>
        </div>
      </aside>
      <div className="main-shell" ref={mainRef}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              aria-expanded={sidebar}
              aria-controls="main-navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <Building2 size={16} />
            <span className="breadcrumb-workspace">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>
              {tab === "rooms"
                ? "Salas de reunião"
                : tab === "mine"
                  ? "Meus compromissos"
                  : tab === "history"
                    ? "Histórico"
                    : "Agenda"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="live-status">
              <span />
              Agenda compartilhada
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button help-top"
              aria-label="Ajuda"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <div
              className="avatar user-avatar"
              title={data?.user?.name || "Seu navegador"}
            >
              {data?.user ? initials(data.user.name) : "R"}
            </div>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div className="page-heading-group">
              <div className="eyebrow">
                <span /> SUA ROTINA, ORGANIZADA
              </div>
              <div className="page-heading-content">
                <h1>
                  {tab === "rooms"
                    ? "Salas de reunião"
                    : tab === "mine"
                      ? "Meus compromissos"
                      : tab === "history"
                        ? "Histórico da Realess"
                        : "Agenda Realess"}
                </h1>
                <p>
                  {tab === "rooms"
                    ? "Gerencie os espaços da Realess e reserve uma sala quando precisar."
                    : tab === "mine"
                      ? "Seus compromissos e reuniões, organizados em um só lugar."
                      : "Organize o dia, acompanhe compromissos e planeje a semana."}
                </p>
              </div>
            </div>
            {(tab === "rooms" || tab === "history") && (
              <button
                className="button button-primary heading-action"
                disabled={!data}
                onClick={() =>
                  tab === "rooms"
                    ? (setFormError(""),
                      setRoomDraft({
                        name: "",
                        capacity: 0,
                        location: "",
                        equipment: "",
                        color: "green",
                      }))
                    : newBooking()
                }
              >
                <Plus size={18} />
                {tab === "rooms" ? "Adicionar sala" : "Novo compromisso"}
              </button>
            )}
          </div>
          {tab === "mine" && (
            <div className="stats-grid agenda-stats">
              <Stat
                icon={<CalendarDays size={20} />}
                label="Compromissos hoje"
                value={todayEvents.length}
                note={fmt(today, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
                color="green"
              />
              <Stat
                icon={<Clock3 size={20} />}
                label="Nesta semana"
                value={data?.stats?.week ?? weekEvents.length}
                note="Uma visão dos próximos encontros"
                color="blue"
              />
              <Stat
                icon={<CalendarCheck2 size={20} />}
                label="Meus compromissos"
                value={
                  data?.stats?.mine ??
                  weekEvents.filter((e) => e.ownerId === data?.user?.id).length
                }
                note="Criados neste navegador"
                color="purple"
              />
            </div>
          )}
          {loading ? (
            <div className="loading-panel">
              <LoaderCircle className="spin" size={26} />
              <h2>Preparando sua agenda…</h2>
              <p>Reunindo os próximos encontros da Realess.</p>
            </div>
          ) : loadError ? (
            <div className="loading-panel error-panel">
              <CalendarDays size={34} />
              <h2>Não foi possível abrir a agenda</h2>
              <p>{loadError}</p>
              <button
                className="button button-primary"
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} />
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {formError && !draft && !roomDraft && !confirm && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              {tab === "history" ? (
                <HistoryPanel
                  rooms={rooms}
                  revision={historyRevision}
                  onSelect={(event) => {
                    changeAnchor(event.date);
                    setView("month");
                    setTab("calendar");
                    setSelected(event);
                  }}
                />
              ) : tab === "rooms" ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        Salas de reunião{" "}
                        <span className="count-pill">{activeRooms.length}</span>
                      </h2>
                      <p>
                        Disponibilidade em tempo real · {currentTime}, horário
                        de Brasília
                      </p>
                    </div>
                  </div>
                  <div className="rooms-grid">
                    {activeRooms.map((room, index) => {
                      const current = busy(room.id);
                      const next = events
                        .filter(
                          (e) =>
                            e.roomId === room.id &&
                            e.date === today &&
                            e.start > currentTime,
                        )
                        .sort((a, b) => a.start.localeCompare(b.start))[0];
                      return (
                        <article
                          className={`room-card color-${room.color}`}
                          key={room.id}
                        >
                          <div className="room-illustration">
                            <div className="room-plan">
                              <div className="table-top" />
                              {Array.from(
                                { length: Math.min(6, room.capacity) },
                                (_, i) => (
                                  <span
                                    className={`chair chair-${i}`}
                                    key={i}
                                  />
                                ),
                              )}
                              <div className="room-window" />
                              <div className="room-plant">
                                <span />
                                <span />
                                <span />
                              </div>
                            </div>
                            <span className="room-number">
                              ESPAÇO {String(index + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={`availability ${current ? "occupied" : ""}`}
                            >
                              <span />
                              {current ? "Em uso" : "Disponível agora"}
                            </span>
                          </div>
                          <div className="room-card-body">
                            <div className="room-title">
                              <h3>{room.name}</h3>
                              <button
                                className="icon-button"
                                aria-label={`Editar ${room.name}`}
                                onClick={() => {
                                  setFormError("");
                                  setRoomDraft(room);
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                            </div>
                            <div className="room-meta">
                              <span>
                                <Users size={14} />
                                {room.capacity
                                  ? `${room.capacity} pessoas`
                                  : "Capacidade não informada"}
                              </span>
                              <span>
                                <MapPin size={14} />
                                {room.location || "Local não informado"}
                              </span>
                            </div>
                            <div className="equipment-list">
                              {room.equipment
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((item) => (
                                  <span key={item}>
                                    <Check size={11} />
                                    {item}
                                  </span>
                                ))}
                            </div>
                            <div className="room-next">
                              <Clock3 size={14} />
                              <span>
                                {current
                                  ? `Em uso até ${current.end}`
                                  : next
                                    ? `Próxima reserva às ${next.start}`
                                    : "Sem outras reservas hoje"}
                              </span>
                            </div>
                            <button
                              className="button room-book-button"
                              onClick={() =>
                                newBooking(
                                  today,
                                  current?.end || undefined,
                                  room.id,
                                )
                              }
                            >
                              Reservar sala
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    <button
                      className="add-room-card"
                      onClick={() => {
                        setFormError("");
                        setRoomDraft({
                          name: "",
                          capacity: 0,
                          location: "",
                          equipment: "",
                          color: "green",
                        });
                      }}
                    >
                      <span>
                        <Plus size={24} />
                      </span>
                      <strong>Um novo espaço</strong>
                      <p>Cadastre uma sala para a equipe.</p>
                    </button>
                  </div>
                </>
              ) : (
                <div className="content-grid">
                  <section
                    className="calendar-card"
                    aria-label="Agenda de compromissos"
                  >
                    <div className="calendar-toolbar">
                      <div className="calendar-title">
                        <h2>
                          {view === "week"
                            ? `${fmt(weekStart, { day: "numeric", month: "short" })} – ${fmt(addDays(weekStart, 4), { day: "numeric", month: "short", year: "numeric" })}`
                            : fmt(anchor, {
                                month: "long",
                                year: "numeric",
                              }).replace(" de ", " ")}
                        </h2>
                        <label className="period-picker">
                          <span className="sr-only">Selecionar mês e ano</span>
                          <input
                            type="month"
                            min="1900-01"
                            max="2199-12"
                            value={anchor.slice(0, 7)}
                            onChange={(event) => {
                              if (/^\d{4}-\d{2}$/.test(event.target.value))
                                changeAnchor(event.target.value + "-01");
                            }}
                          />
                        </label>
                        <div className="calendar-arrows">
                          <button
                            className="icon-button"
                            aria-label="Período anterior"
                            onClick={() =>
                              changeAnchor(
                                view === "month"
                                  ? nextMonth(anchor, -1)
                                  : addDays(anchor, -7),
                              )
                            }
                          >
                            <ChevronLeft size={17} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Próximo período"
                            onClick={() =>
                              changeAnchor(
                                view === "month"
                                  ? nextMonth(anchor, 1)
                                  : addDays(anchor, 7),
                              )
                            }
                          >
                            <ChevronRight size={17} />
                          </button>
                        </div>
                        <button
                          className="today-button"
                          onClick={() => changeAnchor(today)}
                        >
                          Hoje
                        </button>
                        <div
                          className="view-toggle"
                          role="group"
                          aria-label="Visualização do calendário"
                        >
                          {(
                            [
                              ["week", "Semana", CalendarDays],
                              ["month", "Mês", LayoutGrid],
                              ["list", "Lista", List],
                            ] as const
                          ).map(([key, label, Icon]) => (
                            <button
                              key={key}
                              aria-pressed={view === key}
                              className={view === key ? "selected" : ""}
                              onClick={() => setView(key)}
                            >
                              <Icon size={14} />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="calendar-subtoolbar">
                      <label className="search-field">
                        <Search size={16} />
                        <input
                          ref={searchRef}
                          placeholder="Buscar na agenda..."
                          aria-label="Buscar na agenda"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <kbd>Ctrl K</kbd>
                      </label>
                      <div className="calendar-tools">
                        <button
                          aria-label="Filtros da agenda"
                          aria-controls="agenda-filters"
                          aria-expanded={filtersOpen}
                          className={`text-button ${roomFilter.length || kindFilter ? "has-filter" : ""}`}
                          onClick={() => setFiltersOpen(!filtersOpen)}
                        >
                          <SlidersHorizontal size={15} />
                          <span>Filtros</span>
                          {!!(roomFilter.length || kindFilter) && (
                            <span className="filter-count">
                              {roomFilter.length + (kindFilter ? 1 : 0)}
                            </span>
                          )}
                        </button>
                        <span className="tool-divider" />
                        <button
                          className="icon-button"
                          aria-label="Exportar calendário"
                          title="Exportar calendário (.ics)"
                          onClick={() => download()}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                    {!events.length && (
                      <div className="agenda-welcome">
                        <CalendarDays size={17} />
                        <span>
                          <strong>Sua agenda está pronta.</strong> Adicione o
                          primeiro compromisso para organizar sua semana.
                        </span>
                      </div>
                    )}
                    {filtersOpen && (
                      <div className="filter-panel" id="agenda-filters">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={(event) =>
                              setShowCancelled(event.target.checked)
                            }
                          />
                          Exibir cancelados no calendário
                        </label>
                        <fieldset className="inline-room-filters">
                          <legend>Salas de reunião</legend>
                          {activeRooms.map((room) => (
                            <button
                              type="button"
                              key={room.id}
                              className={`filter-chip ${roomFilter.includes(room.id) ? "checked" : ""}`}
                              aria-pressed={roomFilter.includes(room.id)}
                              onClick={() => toggleRoom(room.id)}
                            >
                              {roomFilter.includes(room.id) && (
                                <Check size={14} />
                              )}{" "}
                              {room.name}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`filter-chip ${roomFilter.includes("online") ? "checked" : ""}`}
                            aria-pressed={roomFilter.includes("online")}
                            onClick={() => toggleRoom("online")}
                          >
                            Sem sala de reunião
                          </button>
                        </fieldset>
                        <label>
                          Tipo de encontro
                          <select
                            value={kindFilter}
                            onChange={(e) => setKindFilter(e.target.value)}
                          >
                            <option value="">Todos os tipos</option>
                            {Object.entries(kinds).map(([key, label]) => (
                              <option value={key} key={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="text-button"
                          onClick={() => {
                            setRoomFilter([]);
                            setKindFilter("");
                            setSearch("");
                          }}
                        >
                          Limpar filtros
                        </button>
                      </div>
                    )}
                    <HolidayToolbar
                      record={holidayData.records[Number(anchor.slice(0, 4))]}
                      error={holidayData.error}
                      isAdmin={!!data?.user?.isAdmin}
                      onConfigure={() => setPolicyOpen(true)}
                    />
                    {view === "week" && activeRooms.length > 0 && (
                      <div className="room-color-legend" aria-label="Cores das salas">
                        <strong>Salas</strong>
                        {activeRooms.map((room) => (
                          <button
                            type="button"
                            key={room.id}
                            className={`room-legend-item ${roomFilter.includes(room.id) ? "is-filtered" : ""}`}
                            aria-pressed={roomFilter.includes(room.id)}
                            onClick={() => toggleRoom(room.id)}
                            title={`Filtrar pela sala ${room.name}`}
                          >
                            <span className={`room-legend-dot color-${colorNames[room.color] ? room.color : "green"}`} />
                            {room.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {view === "week" ? (
                      <WeekView
                        holidays={holidays}
                        days={days}
                        today={today}
                        events={filtered}
                        currentTime={currentTime}
                        eventColor={eventColor}
                        eventLocation={eventLocation}
                        onEvent={(e) => {
                          setFormError("");
                          setSelected(e);
                        }}
                        onSlot={newBooking}
                      />
                    ) : view === "month" ? (
                      <MonthView
                        holidays={holidays}
                        anchor={anchor}
                        today={today}
                        events={filtered}
                        eventColor={eventColor}
                        eventLocation={eventLocation}
                        onEvent={setSelected}
                        onDay={changeAnchor}
                        onCreate={newBooking}
                      />
                    ) : (
                      <div className="agenda-list">
                        <div className="list-period">
                          {periodLabel}
                          <span>{rangeEvents.length} compromissos</span>
                        </div>
                        {rangeEvents.length ? (
                          rangeEvents.map((e) => (
                            <button
                              className={`agenda-row ${e.status === "cancelled" ? "is-cancelled" : ""}`}
                              key={e.id}
                              onClick={() => setSelected(e)}
                            >
                              <div className="agenda-date">
                                <strong>
                                  {fmt(e.date, { day: "2-digit" })}
                                </strong>
                                <span>{fmt(e.date, { weekday: "short" })}</span>
                              </div>
                              <span
                                className={`agenda-dot color-${eventColor(e)}`}
                              />
                              <div className="agenda-row-title">
                                <strong>{e.title}</strong>
                                <small
                                  className={`booking-status ${e.status === "cancelled" ? "status-cancelled" : ""}`}
                                >
                                  {bookingStatus(e, today, currentTime)}
                                </small>
                                <span>
                                  {eventLocation(e)} · {e.ownerName}
                                </span>
                              </div>
                              <span className="agenda-row-time">
                                {e.start} – {e.end}
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          ))
                        ) : (
                          <EmptyState
                            onCreate={() => newBooking()}
                            filtered={
                              !!(search || roomFilter.length || kindFilter)
                            }
                            mine={tab === "mine"}
                          />
                        )}
                      </div>
                    )}
                    <footer className="calendar-footer">
                      <span>
                        <span className="footer-dot" />
                        {rangeEvents.length} compromissos no período
                      </span>
                      <span>GMT−3 · São Paulo</span>
                    </footer>
                  </section>
                  <aside className="daily-panel">
                    <section className="today-card">
                      <div className="today-card-heading">
                        <div>
                          <span className="eyebrow">UM OLHAR PARA HOJE</span>
                          <h2>
                            {fmt(today, { day: "numeric", month: "long" })}
                          </h2>
                        </div>
                        <span className="today-count">
                          {todayEvents.length}
                        </span>
                      </div>
                      <div
                        className="today-agenda"
                        tabIndex={0}
                        role="region"
                        aria-label="Compromissos de hoje"
                      >
                        {todayEvents.length ? (
                          todayEvents.map((e) => (
                            <button
                              className={`today-event ${e.end <= currentTime ? "event-past" : ""}`}
                              key={e.id}
                              onClick={() => {
                                setFormError("");
                                setSelected(e);
                              }}
                            >
                              <span
                                className={`timeline-dot color-${eventColor(e)}`}
                              />
                              <span className="today-event-content">
                                <span className="today-event-time">
                                  {e.start} – {e.end}
                                  {e.start <= currentTime &&
                                    e.end > currentTime && (
                                      <span className="now-label">Agora</span>
                                    )}
                                </span>
                                <strong>{e.title}</strong>
                                <span className="today-event-room">
                                  {e.roomId ? (
                                    <DoorOpen size={12} />
                                  ) : e.link || e.kind === "online" ? (
                                    <Video size={12} />
                                  ) : (
                                    <CalendarDays size={12} />
                                  )}
                                  {eventLocation(e)}
                                </span>
                                <span className="today-event-owner">
                                  <span className="tiny-avatar">
                                    {initials(e.ownerName)}
                                  </span>
                                  {e.ownerName}
                                </span>
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))
                        ) : (
                          <div className="today-empty">
                            <CalendarCheck2 size={27} />
                            <strong>Um dia cheio de possibilidades.</strong>
                            <p>Adicione seus compromissos e organize o dia.</p>
                            <button
                              className="text-button"
                              onClick={() => newBooking(today)}
                            >
                              Criar compromisso <Plus size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        className="see-all"
                        onClick={() => {
                          changeAnchor(today);
                          setView("list");
                        }}
                      >
                        Ver agenda da semana
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="upcoming-card">
                      <div className="small-section-title">
                        <h2>Nos próximos dias</h2>
                        <CalendarDays size={17} />
                      </div>
                      <p>O que vem pela frente na sua agenda.</p>
                      <div className="upcoming-list">
                        {upcoming.length ? (
                          upcoming.map((event) => (
                            <button
                              key={event.id}
                              className="upcoming-event"
                              onClick={() => {
                                setFormError("");
                                setSelected(event);
                              }}
                            >
                              <span className="upcoming-date">
                                <strong>
                                  {fmt(event.date, { day: "2-digit" })}
                                </strong>
                                <small>
                                  {fmt(event.date, { month: "short" }).replace(
                                    ".",
                                    "",
                                  )}
                                </small>
                              </span>
                              <span className="upcoming-info">
                                <strong>{event.title}</strong>
                                <small>
                                  {event.start} – {event.end}
                                </small>
                                <small>{eventLocation(event)}</small>
                              </span>
                              <span
                                className={`upcoming-dot color-${eventColor(event)}`}
                              />
                            </button>
                          ))
                        ) : (
                          <div className="upcoming-empty">
                            <p>Sem compromissos para os próximos dias.</p>
                            <button
                              className="text-button"
                              onClick={() => newBooking(addDays(today, 1))}
                            >
                              Planejar um compromisso <Plus size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      {!!upcoming.length && (
                        <button
                          className="see-all"
                          onClick={() => {
                            switchTab("calendar");
                            changeAnchor(upcoming[0].date);
                            setView("list");
                          }}
                        >
                          Ver próximos compromissos
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </section>
                    <button
                      className="agenda-room-shortcut"
                      onClick={() => switchTab("rooms")}
                    >
                      <span>
                        <DoorOpen size={18} />
                      </span>
                      <div>
                        <strong>{activeRooms.length} salas de reunião</strong>
                        <small>Gerenciar espaços da Realess</small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="button button-primary agenda-side-action"
                      disabled={!data}
                      onClick={() => newBooking()}
                    >
                      <Plus size={18} />
                      Novo compromisso
                    </button>
                    <div className="quiet-note">
                      <span className="quiet-note-symbol">✳</span>
                      <p>
                        Um dia organizado.
                        <br />
                        <strong>Uma semana mais leve.</strong>
                      </p>
                      <span className="quiet-note-decoration" />
                    </div>
                  </aside>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              Um lugar para fazer acontecer. <strong>Realess.</strong>
            </span>
            <span>
              <span className="live-dot" />
              {loading
                ? "Conectando…"
                : loadError
                  ? "Aguardando conexão"
                  : "Atualiza a cada 30 segundos"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Dispensar mensagem" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <Modal
          title={selected.title}
          subtitle={
            selected.demo
              ? "Agendamento ilustrativo"
              : "Detalhes do compromisso"
          }
          onClose={() => setSelected(null)}
        >
          <div className="event-detail">
            <span className={`detail-kind color-${eventColor(selected)}`}>
              {kinds[selected.kind] || "Reunião"}
            </span>
            <span
              className={`booking-status ${selected.status === "cancelled" ? "status-cancelled" : ""}`}
            >
              {bookingStatus(selected, today, currentTime)}
            </span>
            <MeetingLinkDetail
              value={selected.link}
              onCopy={copyMeetingLink}
              onAddLink={
                selected.status !== "cancelled" &&
                (selected.demo || selected.ownerId === data?.user?.id)
                  ? () => editBooking(selected)
                  : undefined
              }
            />
            <div className="detail-row">
              <CalendarDays size={20} />
              <div>
                <strong>
                  {fmt(selected.date, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <span>
                  {selected.start} – {selected.end} · horário de Brasília
                </span>
              </div>
            </div>
            <div className="detail-row">
              {selected.roomId ? (
                <DoorOpen size={20} />
              ) : selected.link || selected.kind === "online" ? (
                <Video size={20} />
              ) : (
                <CalendarDays size={20} />
              )}
              <div>
                <strong>{eventLocation(selected)}</strong>
                <span>
                  {selected.roomId
                    ? roomById(selected.roomId)?.location ||
                      "Sala reservada para este compromisso."
                    : "Este compromisso não reserva uma sala."}
                </span>
              </div>
            </div>
            <div className="detail-row">
              <Users size={20} />
              <div>
                <strong>{selected.ownerName}</strong>
                <span>
                  Organizador
                  {selected.participants ? ` · ${selected.participants}` : ""}
                  {selected.participantsRestricted
                    ? " · Participantes visíveis apenas ao organizador"
                    : ""}
                </span>
              </div>
            </div>
            {/* Informativo discreto de quem agendou esta reunião */}
            <div className="creator-audit-box">
              <button
                type="button"
                className="creator-audit-toggle"
                onClick={() => setShowAudit((prev) => !prev)}
                title="Ver quem realizou este agendamento no sistema"
              >
                <Info size={14} />
                <span>{showAudit ? "Ocultar dados de quem agendou" : "Quem agendou esta reunião?"}</span>
              </button>
              {showAudit && (
                <div className="creator-audit-card">
                  <div className="creator-audit-row">
                    <Users size={16} />
                    <div>
                      <span className="creator-audit-caption">Agendado no sistema por</span>
                      <strong className="creator-audit-name">
                        {selected.createdByName || selected.ownerName}
                      </strong>
                      {selected.createdByEmail && (
                        <span className="creator-audit-email"> ({selected.createdByEmail})</span>
                      )}
                    </div>
                  </div>
                  {selected.createdAt !== undefined && (
                    <div className="creator-audit-row">
                      <Clock3 size={16} />
                      <div>
                        <span className="creator-audit-caption">Data e hora do registro</span>
                        <span>
                          {new Intl.DateTimeFormat("pt-BR", {
                            timeZone: TZ,
                            dateStyle: "long",
                            timeStyle: "short",
                          }).format(new Date(selected.createdAt))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="record-timestamps">
              {selected.createdAt !== undefined && (
                <span>
                  Criado em{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: TZ,
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(selected.createdAt))}
                </span>
              )}
              {!!selected.updatedAt && (selected.version || 1) > 1 && (
                <span>
                  Última alteração:{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: TZ,
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(selected.updatedAt))}
                </span>
              )}
            </div>
            {selected.ownerId === data?.user?.id && (
              <BookingAudit key={selected.id} bookingId={selected.id} />
            )}
            {selected.description && (
              <p className="detail-description">{selected.description}</p>
            )}
          </div>
          <div className="modal-actions detail-actions">
            {selected.ownerId === data?.user?.id && selected.participants && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setInvitation(selected);
                  setRemovedInvitation(null);
                  setRemovedOnly(false);
                  setSelected(null);
                }}
              >
                {selected.status === "cancelled"
                  ? "Preparar aviso de cancelamento"
                  : (selected.version || 1) > 1
                    ? "Preparar atualização do convite"
                    : "Preparar convite"}
              </button>
            )}
            <button
              className="button button-secondary"
              onClick={() => download([selected])}
            >
              <Download size={15} />
              Exportar
            </button>
            {selected.status !== "cancelled" &&
              (selected.demo || selected.ownerId === data?.user?.id) && (
                <>
                  <button
                    className="button button-primary"
                    onClick={() => editBooking(selected)}
                  >
                    <Pencil size={15} />
                    {selected.demo ? "Usar como modelo" : "Editar compromisso"}
                  </button>
                  {!selected.demo && (
                    <button
                      className="icon-button danger-text"
                      aria-label="Cancelar compromisso"
                      title="Cancelar compromisso"
                      onClick={() => {
                        setConfirm({
                          type: "booking",
                          id: selected.id,
                          name: selected.title,
                        });
                        setSelected(null);
                        setFormError("");
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </>
              )}
          </div>
        </Modal>
      )}
      {draft && (
        <Modal
          title={draft.id ? "Editar compromisso" : "Novo compromisso"}
          subtitle="Organize os detalhes. A reserva de sala é opcional."
          wide
          onClose={() => {
            if (!saving) setDraft(null);
          }}
        >
          <form onSubmit={saveBooking} className="booking-form">
            <div className="form-row">
              <label>
                Nome do organizador <span>*</span>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={draft.organizerName}
                  placeholder="Seu nome"
                  onChange={(e) =>
                    setDraft({ ...draft, organizerName: e.target.value })
                  }
                />
              </label>
              <label>
                E-mail do organizador <span className="optional">opcional</span>
                <input
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={draft.organizerEmail}
                  placeholder="seu.nome@empresa.com.br"
                  onChange={(e) =>
                    setDraft({ ...draft, organizerEmail: e.target.value })
                  }
                />
                <small>
                  Usado para gerar o convite .ics no Outlook. Não é necessário
                  criar uma conta.
                </small>
              </label>
            </div>
            <label>
              Título do compromisso <span>*</span>
              <input
                required
                maxLength={120}
                placeholder="Ex.: Entrega de projeto, retorno ao cliente ou reunião"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                autoFocus
              />
            </label>
            <div className="form-row three-col">
              <label>
                Data <span>*</span>
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label>
                Início <span>*</span>
                <input
                  type="time"
                  required
                  value={draft.start}
                  onChange={(e) =>
                    setDraft({ ...draft, start: e.target.value })
                  }
                />
              </label>
              <label>
                Término <span>*</span>
                <input
                  type="time"
                  required
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Sala de reunião <span className="optional">opcional</span>
                <select
                  value={draft.roomId}
                  onChange={(e) =>
                    setDraft({ ...draft, roomId: e.target.value })
                  }
                >
                  <option value="">Sem sala de reunião</option>
                  {activeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                      {room.capacity ? ` · ${room.capacity} pessoas` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de encontro
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                >
                  {Object.entries(kinds).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MeetingLinkField
              value={draft.link}
              onChange={(link) => setDraft({ ...draft, link })}
            />
            {draftConflict ? (
              <div className="conflict-note" role="alert">
                <Info size={17} />
                <span>
                  Esse horário coincide com{" "}
                  <strong>{draftConflict.title}</strong> ({draftConflict.start}{" "}
                  – {draftConflict.end}). Escolha outra sala ou horário.
                </span>
              </div>
            ) : (
              draft.roomId &&
              draft.start < draft.end && (
                <div className="available-note">
                  <CheckCircle2 size={15} />
                  Sala disponível no horário selecionado.
                </div>
              )
            )}
            {draftHoliday && (
              <p className="form-error" role="alert">
                {holidayMessage(draftHoliday)}
              </p>
            )}
            <RecipientsField
              value={draft.participants}
              legacy={legacyRecipients}
              onChange={(participants) =>
                setDraft((current) =>
                  current ? { ...current, participants } : current,
                )
              }
            />
            <label>
              Descrição <span className="optional">opcional</span>
              <textarea
                maxLength={2000}
                rows={3}
                placeholder="Pauta, objetivos ou algo que a equipe precisa saber…"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            {formError && (
              <div role="alert" className="form-error">
                {formError}
              </div>
            )}
            <div className="form-footnote">
              <Clock3 size={14} />
              Todos os horários seguem o fuso de São Paulo (GMT−3).
            </div>
            <p className="form-footnote">
              A edição e a lista de participantes ficam vinculadas a este
              navegador. Ao trocar de navegador ou limpar os cookies, você
              poderá consultar os compromissos, mas perderá a permissão de
              editá-los.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={saving || !!draftConflict || !!draftHoliday}
                className="button button-primary"
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                {saving
                  ? "Salvando…"
                  : splitRecipients(draft.participants).some(validEmail)
                    ? draft.id
                      ? "Salvar alterações e preparar convite no Outlook"
                      : "Salvar compromisso e preparar convite no Outlook"
                    : draft.id
                      ? "Salvar alterações"
                      : "Salvar compromisso"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {roomDraft && (
        <Modal
          title={
            roomDraft.id ? "Editar espaço" : "Um novo espaço para a equipe"
          }
          subtitle="Cadastre as informações da sala de reunião."
          onClose={() => {
            if (!saving) setRoomDraft(null);
          }}
        >
          <form className="booking-form" onSubmit={saveRoom}>
            <label>
              Nome da sala <span>*</span>
              <input
                autoFocus
                required
                maxLength={70}
                placeholder="Ex.: Sala de reuniões 01"
                value={roomDraft.name}
                onChange={(e) =>
                  setRoomDraft({ ...roomDraft, name: e.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                Capacidade <span className="optional">opcional</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={roomDraft.capacity || ""}
                  onChange={(e) =>
                    setRoomDraft({
                      ...roomDraft,
                      capacity: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Localização
                <input
                  maxLength={100}
                  placeholder="Ex.: 1º andar"
                  value={roomDraft.location}
                  onChange={(e) =>
                    setRoomDraft({ ...roomDraft, location: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Recursos disponíveis
              <input
                maxLength={300}
                placeholder="TV, projetor, quadro branco…"
                value={roomDraft.equipment}
                onChange={(e) =>
                  setRoomDraft({ ...roomDraft, equipment: e.target.value })
                }
              />
              <small>Separe os recursos por vírgula.</small>
            </label>
            <fieldset className="color-field">
              <legend>Cor na agenda</legend>
              {Object.entries(colorNames).map(([key, label]) => (
                <button
                  type="button"
                  className={`color-option color-${key} ${roomDraft.color === key ? "selected" : ""}`}
                  key={key}
                  aria-label={label}
                  title={label}
                  aria-pressed={roomDraft.color === key}
                  onClick={() => setRoomDraft({ ...roomDraft, color: key })}
                >
                  {roomDraft.color === key && <Check size={17} />}
                  <span className="color-option-label">{label}</span>
                </button>
              ))}
            </fieldset>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              {roomDraft.id && (
                <button
                  type="button"
                  disabled={saving}
                  className="button danger-text archive-button"
                  onClick={() => {
                    setConfirm({
                      type: "room",
                      id: roomDraft.id!,
                      name: roomDraft.name,
                    });
                    setRoomDraft(null);
                    setFormError("");
                  }}
                >
                  <Trash2 size={15} />
                  Arquivar
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                className="button button-secondary"
                onClick={() => setRoomDraft(null)}
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="button button-primary"
              >
                {saving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Salvar sala
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.type === "booking"
              ? "Cancelar este compromisso?"
              : "Arquivar este espaço?"
          }
          onClose={() => {
            if (!saving) setConfirm(null);
          }}
        >
          <p className="confirm-description">
            {confirm.type === "booking" ? (
              <>
                O compromisso <strong>{confirm.name}</strong> será marcado como
                cancelado e permanecerá no histórico. Se houver uma sala
                reservada, o horário ficará disponível.
              </>
            ) : (
              <>
                A sala <strong>{confirm.name}</strong> deixará de receber novas
                reservas. O histórico será mantido. Salas com reservas futuras
                precisam ter seus agendamentos transferidos ou cancelados antes.
              </>
            )}
          </p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button button-secondary"
              disabled={saving}
              onClick={() => setConfirm(null)}
            >
              Voltar
            </button>
            <button
              className="button button-danger"
              disabled={saving}
              onClick={async () => {
                const result = await mutate(
                  {
                    action:
                      confirm.type === "booking"
                        ? "deleteBooking"
                        : "archiveRoom",
                    id: confirm.id,
                  },
                  confirm.type === "booking"
                    ? "Compromisso cancelado."
                    : "Sala arquivada.",
                );
                if (result) {
                  setConfirm(null);
                  setRoomFilter([]);
                  if (result.booking?.participants)
                    setInvitation(result.booking);
                  setRemovedInvitation(null);
                  setRemovedOnly(false);
                }
              }}
            >
              {saving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Trash2 size={16} />
              )}
              Confirmar{" "}
              {confirm.type === "booking" ? "cancelamento" : "arquivamento"}
            </button>
          </div>
        </Modal>
      )}
      {invitation && data?.user && (
        <InvitationDialog
          event={invitation}
          rooms={rooms}
          organizer={data.user}
          removedEvent={removedOnly ? null : removedInvitation}
          removedOnly={removedOnly}
          onPrepareRemoved={() => {
            if (removedInvitation) {
              setInvitation(removedInvitation);
              setRemovedInvitation(null);
              setRemovedOnly(true);
            }
          }}
          onClose={() => setInvitation(null)}
        />
      )}
      {policyOpen && (
        <CalendarPolicyDialog
          record={holidayData.records[Number(anchor.slice(0, 4))]}
          onClose={() => setPolicyOpen(false)}
          onSaved={() => {
            setPolicyOpen(false);
            holidayData.reload();
            setToast("Calendário da empresa atualizado.");
          }}
        />
      )}
      {help && (
        <Modal
          title="Uma agenda para conectar a Realess"
          subtitle="Tudo o que você precisa para começar."
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <div>
              <CalendarDays size={22} />
              <section>
                <h3>Organize a rotina</h3>
                <p>
                  Use “Novo compromisso” para registrar atividades, reuniões ou
                  compromissos. Você também pode clicar em um horário da agenda.
                  A reserva de sala é opcional.
                </p>
              </section>
            </div>
            <div>
              <DoorOpen size={22} />
              <section>
                <h3>Reserve sem desencontros</h3>
                <p>
                  A Realess já tem Sala de reunião 1 e Sala de reunião 2
                  cadastradas. Você pode editar os espaços ou criar novas salas.
                  A agenda impede reservas simultâneas na mesma sala.
                </p>
              </section>
            </div>
            <div>
              <Users size={22} />
              <section>
                <h3>Sua equipe, na mesma página</h3>
                <p>
                  Os compromissos ficam salvos e a agenda atualiza a cada 30
                  segundos. Qualquer pessoa com o link pode consultar a agenda e
                  criar compromissos, sem login. A edição, o cancelamento e a
                  lista de participantes ficam vinculados ao navegador que criou
                  o compromisso. Limpar os cookies ou trocar de navegador remove
                  essa permissão de edição.
                </p>
              </section>
            </div>
            <div>
              <Download size={22} />
              <section>
                <h3>Leve a agenda com você</h3>
                <p>
                  Exporte os encontros em formato .ics e importe no Outlook ou
                  Google Agenda. Ao salvar uma reunião com participantes, você
                  pode preparar o e-mail com o link do Meet ou baixar o convite
                  .ics. Confira os dados e confirme o envio no Outlook ou no seu
                  aplicativo padrão de e-mail.
                </p>
              </section>
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="button button-primary"
              onClick={() => setHelp(false)}
            >
              Tudo certo <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  note: string;
  color: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon color-${color}`}>{icon}</span>
      </div>
      <strong className="stat-value">
        {typeof value === "number" ? String(value).padStart(2, "0") : value}
      </strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}
function WeekView({
  holidays,
  days,
  today,
  events,
  currentTime,
  eventColor,
  eventLocation,
  onEvent,
  onSlot,
}: {
  holidays: Holiday[];
  days: string[];
  today: string;
  events: Booking[];
  currentTime: string;
  eventColor: (e: Booking) => string;
  eventLocation: (event: Booking) => string;
  onEvent: (e: Booking) => void;
  onSlot: (day: string, start: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByAmount = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };
  const visible = events.filter((e) => days.includes(e.date));
  const startHour = Math.min(
    8,
    ...visible.map((e) => Math.floor(minutes(e.start) / 60)),
  );
  const endHour = Math.max(
    18,
    ...visible.map((e) => Math.ceil(minutes(e.end) / 60)),
  );
  const hourCount = endHour - startHour;
  const hourHeight = 5.75; // rem
  const calendarMinWidth = Math.max(1100, days.length * 190);

  return (
    <div className="week-scroll-container">
      <div className="week-scroll-nav">
        <span className="week-scroll-nav-text">
          Mostrando <strong>{days.length} dias úteis</strong> a partir de {days[0] === today ? "Hoje" : fmt(days[0], { day: "numeric", month: "short" })}
        </span>
        <div className="week-scroll-nav-buttons">
          <button
            type="button"
            className="scroll-nav-btn"
            onClick={() => scrollByAmount(-280)}
            title="Rolar para a esquerda"
            aria-label="Rolar dias para a esquerda"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="scroll-nav-btn"
            onClick={() => scrollByAmount(280)}
            title="Rolar para a direita"
            aria-label="Rolar dias para a direita"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div
        className="week-scroll"
        tabIndex={0}
        ref={scrollRef}
        role="region"
        aria-label="Agenda semanal por horários"
      >
        <div className="week-calendar" style={{ minWidth: `${calendarMinWidth}px` }}>
          <div
            className="week-head"
            style={{
              gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(11rem, 1fr))`,
            }}
          >
            <div className="timezone-cell">GMT−3</div>
            {days.map((day) => {
              const isToday = day === today;
              const isTomorrow = day === addDays(today, 1);
              return (
                <div
                  title={holidays
                    .filter((item) => item.date === day)
                    .map(
                      (item) =>
                        `${item.name} · ${item.kind === "optional" ? "Ponto facultativo" : "Feriado"}`,
                    )
                    .join(" · ")}
                  className={`day-heading ${isToday ? "is-today" : ""} ${holidays.some((item) => item.date === day && item.kind !== "optional") ? "has-holiday" : holidays.some((item) => item.date === day) ? "has-optional" : ""}`}
                  key={day}
                >
                  <div className="day-heading-top">
                    <span>{fmt(day, { weekday: "short" })}</span>
                    {isToday && <span className="today-badge">HOJE</span>}
                    {!isToday && isTomorrow && <span className="tomorrow-badge">AMANHÃ</span>}
                  </div>
                  <strong>{fmt(day, { day: "2-digit" })}</strong>
                  {holidays.some((item) => item.date === day) && (
                    <span
                      className={`holiday-marker ${holidays.some((item) => item.date === day && item.kind !== "optional") ? "" : "optional-marker"}`}
                      aria-label={holidays
                        .filter((item) => item.date === day)
                        .map((item) => item.name)
                        .join(" · ")}
                    />
                  )}
                  {isToday && <span className="today-indicator" />}
                </div>
              );
            })}
            {days.includes(today) &&
              minutes(currentTime) >= startHour * 60 &&
              minutes(currentTime) < endHour * 60 && (
                <div
                  className="current-time-line"
                  style={{
                    top: `${((minutes(currentTime) - startHour * 60) / 60) * hourHeight}rem`,
                    right: `${((days.length - days.indexOf(today) - 1) / days.length) * 100}%`,
                  }}
                >
                  <span />
                </div>
              )}
          </div>
          <div
            className="week-body"
            style={{ height: `${hourCount * hourHeight}rem` }}
          >
            <div className="hour-column">
              {Array.from({ length: hourCount }, (_, i) => (
                <span key={i} style={{ top: `${i * hourHeight}rem` }}>
                  {String(startHour + i).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day) => (
              <div
                className={`day-column ${day === today ? "is-today" : ""}`}
                key={day}
              >
                {Array.from({ length: hourCount * 2 }, (_, i) => (
                  <button
                    className={`time-slot ${i % 2 === 0 ? "hour-start" : ""}`}
                    key={i}
                    style={{ top: `${i * (hourHeight / 2)}rem` }}
                    aria-label={`Agendar ${fmt(day, { day: "numeric", month: "long" })} às ${toTime(startHour * 60 + i * 30)}`}
                    onClick={() => onSlot(day, toTime(startHour * 60 + i * 30))}
                  >
                    <Plus size={14} />
                  </button>
                ))}
                {placeEvents(events.filter((e) => e.date === day)).map(
                  ({ event, lane, lanes }) => {
                    const isNow = event.date === today && currentTime >= event.start && currentTime < event.end;
                    const isPast = event.date < today || (event.date === today && event.end <= currentTime);
                    const durationMins = minutes(event.end) - minutes(event.start);
                    const isShort = durationMins < 60;
                    return (
                      <button
                        key={event.id}
                        className={`calendar-event ${isNow ? "is-now" : isPast ? "event-past" : "event-future"} ${event.status === "cancelled" ? "is-cancelled" : ""} color-${eventColor(event)} ${isShort ? "short-event" : ""}`}
                        style={{
                          top: `${((minutes(event.start) - startHour * 60) / 60) * hourHeight + 0.0625}rem`,
                          height: `${Math.max(2.75, (durationMins / 60) * hourHeight - 0.125)}rem`,
                          left: `calc(${(lane / lanes) * 100}% + 4px)`,
                          width: `calc(${100 / lanes}% - 8px)`,
                        }}
                        title={`${event.title} (${event.start} - ${event.end}) · ${eventLocation(event)} · ${event.ownerName}`}
                        onClick={() => onEvent(event)}
                      >
                        <div className="event-card-content">
                          <div className="event-card-main">
                            {isNow && (
                              <span className="event-now-pill">
                                <span className="pulse-dot" /> AGORA
                              </span>
                            )}
                            <strong className="event-title-highlight">{event.title}</strong>
                            <span
                              className="event-meta"
                              aria-label={`Local: ${eventLocation(event)}. Marcado por: ${event.ownerName}`}
                            >
                              <span className="event-meta-room" title={eventLocation(event)}>
                                {event.roomId ? (
                                  <DoorOpen size={11} />
                                ) : event.link || event.kind === "online" ? (
                                  <Video size={11} />
                                ) : (
                                  <CalendarDays size={11} />
                                )}
                                <span>{eventLocation(event)}</span>
                              </span>
                              {event.ownerName && (
                                <span
                                  className="event-meta-person"
                                  title={`Marcado por ${event.ownerName}`}
                                >
                                  <Users size={11} />
                                  <span>{event.ownerName}</span>
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="event-time-vertical" aria-label={`${event.start} às ${event.end}`}>
                            <span>{event.start} – {event.end}</span>
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function EmptyState({
  onCreate,
  filtered,
  mine,
}: {
  onCreate: () => void;
  filtered: boolean;
  mine: boolean;
}) {
  return (
    <div className="empty-state">
      <span>
        <CalendarDays size={28} />
      </span>
      <h3>
        {filtered
          ? "Nenhum encontro por aqui."
          : mine
            ? "Seu próximo encontro começa aqui."
            : "Sua agenda começa aqui."}
      </h3>
      <p>
        {filtered
          ? "Tente outro termo ou ajuste os filtros da agenda."
          : mine
            ? "Os compromissos que você criar vão aparecer nesta lista."
            : "Adicione um compromisso, uma atividade ou uma reunião."}
      </p>
      <button className="button button-primary" onClick={onCreate}>
        <Plus size={16} />
        Novo compromisso
      </button>
    </div>
  );
}
