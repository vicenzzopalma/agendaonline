export const RECIPIENTS_LIMIT = 1000;
export const splitRecipients = (value: string) =>
  value
    .split(/[,;\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

// Deliberately accept conventional mailbox addresses, not display names or
// quoted addresses. This also prevents mailto/calendar header injection.
export function validEmail(value: string) {
  if (value.length > 254 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return (
    local.length > 0 &&
    local.length <= 64 &&
    /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+$/i.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    domain.length <= 253 &&
    domain.includes(".") &&
    domain
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

export function normalizeRecipients(value: string, legacy: string[] = []) {
  if (value.length > RECIPIENTS_LIMIT)
    throw new Error("A lista de participantes deve ter até 1.000 caracteres.");
  const seen = new Set<string>();
  return splitRecipients(value)
    .map((part) => {
      if (!validEmail(part) && !legacy.includes(part))
        throw new Error(
          `E-mail inválido: ${part}. Informe o endereço completo.`,
        );
      return validEmail(part) ? part.toLowerCase() : part;
    })
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

export function invitationRecipients(value: string) {
  const emails = splitRecipients(value).filter(validEmail);
  return [...new Set(emails.map((email) => email.toLowerCase()))];
}

export function visibleBooking<
  T extends { ownerId: string; participants: string },
>(booking: T, viewerId: string) {
  return booking.ownerId === viewerId
    ? booking
    : { ...booking, participants: "", participantsRestricted: true };
}

// Search public event fields separately so another user's email cannot be
// inferred from result counts, pagination, or search matches.
export function publicSearchSQL() {
  let expression = "(title || ' ' || owner_name)";
  for (const [letters, replacement] of [
    ["áàâãäÁÀÂÃÄ", "a"],
    ["éèêëÉÈÊË", "e"],
    ["íìîïÍÌÎÏ", "i"],
    ["óòôõöÓÒÔÕÖ", "o"],
    ["úùûüÚÙÛÜ", "u"],
    ["çÇ", "c"],
  ])
    for (const letter of letters)
      expression = `replace(${expression},'${letter}','${replacement}')`;
  return `lower(${expression})`;
}
