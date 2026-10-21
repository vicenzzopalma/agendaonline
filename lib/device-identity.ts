export const DEVICE_COOKIE = "realess_device";
export const DEVICE_LIFETIME = 365 * 24 * 60 * 60;
export const deviceCookieName = (url: string) =>
  new URL(url).protocol === "https:" ? "__Host-realess_device" : DEVICE_COOKIE;

export function readDeviceToken(
  cookieHeader: string | null,
  cookieName = DEVICE_COOKIE,
) {
  const matches = (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export const createDeviceToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export async function hashDeviceToken(token: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function deviceCookie(url: string, token: string) {
  return `${deviceCookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEVICE_LIFETIME}${new URL(url).protocol === "https:" ? "; Secure" : ""}`;
}
