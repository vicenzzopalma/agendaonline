"use client";
import { CalendarDays, Settings2 } from "lucide-react";
import {
  blockedHoliday,
  holidayMessage,
  type Holiday,
  type HolidayYear,
} from "../lib/holidays";
export function HolidayNotice({
  date,
  holidays,
}: {
  date: string;
  holidays: Holiday[];
}) {
  const entries = holidays.filter((item) => item.date === date);
  if (!entries.length) return null;
  const blocked = blockedHoliday(date, holidays);
  return (
    <div
      className={`holiday-notice ${blocked ? "holiday-blocked" : ""}`}
      role="status"
    >
      <CalendarDays size={18} />
      <div>
        {entries.map((item, index) => (
          <p key={index}>
            <strong>{item.name}</strong> ·{" "}
            {item.kind === "optional"
              ? "Ponto facultativo"
              : item.kind === "exception"
                ? "Configuração da empresa"
                : `Feriado ${item.scope}`}
            {item.note && <span> · {item.note}</span>}
          </p>
        ))}
        <p>
          {blocked
            ? holidayMessage(blocked)
            : "Agendamentos permitidos conforme o calendário da empresa."}
        </p>
      </div>
    </div>
  );
}
export function HolidayToolbar({
  record,
  error,
  isAdmin,
  onConfigure,
}: {
  record?: HolidayYear;
  error: string;
  isAdmin: boolean;
  onConfigure: () => void;
}) {
  return (
    <div className="holiday-toolbar">
      <div className="holiday-legend">
        <span>
          <i />
          Feriado
        </span>
        <span>
          <i className="optional-marker" />
          Ponto facultativo
        </span>
      </div>
      <div className="holiday-toolbar-actions">
        {record && (
          <a href={record.source} target="_blank" rel="noopener noreferrer">
            Calendário oficial {record.year}
          </a>
        )}
        {isAdmin && (
          <button
            type="button"
            className="text-button"
            disabled={!record}
            onClick={onConfigure}
          >
            <Settings2 size={16} />
            Configurar calendário
          </button>
        )}
      </div>
      {(error || record?.state !== "fresh") && (
        <p className="holiday-source-note">
          {error ||
            (record
              ? "Usando regras recorrentes validadas. O calendário anual pode ainda não estar publicado; pontos facultativos locais podem receber atualizações."
              : "Consultando o calendário oficial…")}
        </p>
      )}
    </div>
  );
}
