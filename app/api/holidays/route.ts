import { getChatGPTUser } from "../../chatgpt-auth";
import { getHolidayYear, isCalendarAdmin } from "../../../lib/holiday-service";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: "Entre para consultar o calendário." },
      { status: 401 },
    );
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 1900 || year > 2199)
    return Response.json(
      { error: "Consulte um ano entre 1900 e 2199." },
      { status: 400 },
    );
  try {
    return Response.json(await getHolidayYear(year, isCalendarAdmin(user)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Não foi possível consultar o calendário. Tente novamente." },
      { status: 503 },
    );
  }
}
