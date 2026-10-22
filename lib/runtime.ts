import { getDatabase } from "../db/local-sqlite.mjs";

// Lazy: a production build must never create or modify the live database.
export const env = {
  get DB() { return getDatabase(); },
};

export function publicOrigin(request?: Request) {
  const configured = process.env.PUBLIC_URL;
  if (!configured) return request ? new URL(request.url).origin : "http://127.0.0.1:3000";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("PUBLIC_URL deve conter somente a origem da agenda, como https://agenda.realess.com.br.");
  return url.origin;
}

export function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === publicOrigin(request));
}
