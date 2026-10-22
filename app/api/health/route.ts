import { env } from "../../../lib/runtime";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await env.DB.prepare("SELECT 1").first();
    return Response.json({ status: "ok", service: "agenda-realess" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Health check do banco falhou:", error);
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
