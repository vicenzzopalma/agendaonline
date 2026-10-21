"use client";
import { useId, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  normalizeRecipients,
  splitRecipients,
  validEmail,
} from "../lib/recipients";

export function RecipientsField({
  value,
  legacy,
  onChange,
}: {
  value: string;
  legacy: string[];
  onChange: (value: string) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(""),
    [error, setError] = useState("");
  const tokens = splitRecipients(value);
  function commit(text = pending) {
    try {
      onChange(
        normalizeRecipients([value, text].filter(Boolean).join(", "), legacy),
      );
      setPending("");
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  function remove(index: number) {
    onChange(tokens.filter((_, i) => i !== index).join(", "));
  }
  return (
    <div className="recipients-field">
      <label htmlFor={id}>Participantes</label>
      {!!tokens.length && (
        <ul className="recipient-chips" aria-label="Participantes adicionados">
          {tokens.map((token, index) => (
            <li
              key={token.toLowerCase()}
              className={!validEmail(token) ? "recipient-legacy" : ""}
            >
              <span>
                {token}
                {!validEmail(token) && <small> · sem e-mail</small>}
              </span>
              <button
                type="button"
                aria-label={`Editar ${token}`}
                onClick={() => {
                  if (pending.trim()) {
                    setError(
                      "Conclua ou limpe o e-mail em edição antes de editar outro participante.",
                    );
                    input.current?.focus();
                    return;
                  }
                  remove(index);
                  setPending(token);
                  input.current?.focus();
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                aria-label={`Remover ${token}`}
                onClick={() => remove(index)}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        id={id}
        name="participantPending"
        type="text"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        maxLength={1000}
        value={pending}
        placeholder="nome@empresa.com.br"
        aria-invalid={!!error}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        onChange={(e) => {
          setPending(e.target.value);
          setError("");
        }}
        onBlur={() => {
          if (pending.trim()) commit();
        }}
        onKeyDown={(e) => {
          if (["Enter", ",", ";"].includes(e.key)) {
            e.preventDefault();
            commit();
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (/[,;\r\n]/.test(pasted)) {
            e.preventDefault();
            const element = e.currentTarget;
            const text =
              pending.slice(0, element.selectionStart ?? pending.length) +
              pasted +
              pending.slice(element.selectionEnd ?? pending.length);
            setPending(text);
            commit(text);
          }
        }}
      />
      <small id={`${id}-help`}>
        Separe os e-mails por vírgula, ponto e vírgula ou Enter. O envio é
        confirmado no aplicativo de e-mail. A lista fica visível apenas para
        você.
      </small>
      {tokens.some((token) => !validEmail(token)) && (
        <small>
          Participantes antigos sem e-mail foram preservados. Edite as etiquetas
          para incluí-los nos convites.
        </small>
      )}
      {error && (
        <p className="form-error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
