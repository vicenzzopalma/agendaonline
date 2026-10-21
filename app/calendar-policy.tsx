"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./modal";
import {
  DEFAULT_POLICY,
  type CalendarPolicy,
  type HolidayYear,
} from "../lib/holidays";

export function CalendarPolicyDialog({
  record,
  onClose,
  onSaved,
}: {
  record?: HolidayYear;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState<CalendarPolicy>(
      record?.policy || DEFAULT_POLICY,
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/calendar-policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(policy),
        }),
        body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Calendário da empresa"
      subtitle="Brasil · Santa Catarina · Joinville"
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="booking-form" onSubmit={save}>
        <p className="policy-explanation">
          Feriados oficiais são bloqueados. Pontos facultativos permanecem
          disponíveis por padrão. Exceções exigem uma justificativa e ficam
          registradas.
        </p>
        <label className="policy-checkbox">
          <input
            type="checkbox"
            checked={policy.blockOptional}
            onChange={(event) =>
              setPolicy({ ...policy, blockOptional: event.target.checked })
            }
          />
          Tratar os pontos facultativos municipais como dias inteiros não úteis
        </label>
        <div className="policy-section-heading">
          <h3>Exceções autorizadas</h3>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setPolicy({
                ...policy,
                overrides: [
                  ...policy.overrides,
                  { date: "", allowBooking: true, note: "" },
                ],
              })
            }
          >
            <Plus size={16} />
            Adicionar exceção
          </button>
        </div>
        {policy.overrides.map((item, index) => (
          <fieldset className="policy-override" key={index}>
            <legend>Exceção {index + 1}</legend>
            <div className="form-row">
              <label>
                Data da exceção
                <input
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  required
                  value={item.date}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      overrides: policy.overrides.map((value, i) =>
                        i === index
                          ? { ...value, date: event.target.value }
                          : value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Tratamento
                <select
                  value={item.allowBooking ? "allow" : "block"}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      overrides: policy.overrides.map((value, i) =>
                        i === index
                          ? {
                              ...value,
                              allowBooking: event.target.value === "allow",
                            }
                          : value,
                      ),
                    })
                  }
                >
                  <option value="allow">Permitir agendamentos</option>
                  <option value="block">Bloquear agendamentos</option>
                </select>
              </label>
            </div>
            <label>
              Justificativa
              <input
                required
                minLength={3}
                maxLength={300}
                value={item.note}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    overrides: policy.overrides.map((value, i) =>
                      i === index
                        ? { ...value, note: event.target.value }
                        : value,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="text-button danger-text"
              onClick={() =>
                setPolicy({
                  ...policy,
                  overrides: policy.overrides.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 size={15} />
              Remover exceção {index + 1}
            </button>
          </fieldset>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={saving}
            onClick={onClose}
          >
            Voltar
          </button>
          <button className="button button-primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar calendário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
