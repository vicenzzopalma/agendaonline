import { loadConfig } from "./config.mjs";
import { getDatabase } from "../../db/local-sqlite.mjs";
loadConfig();
const db = getDatabase().connection;
const [command = "list", visitor, owner] = process.argv.slice(2);
if (command === "list") {
  console.table(db.prepare("SELECT visitor_id AS navegador,display_name AS nome,email,is_admin AS administrador,datetime(expires_at/1000,'unixepoch') AS validade_utc FROM agenda_visitors WHERE expires_at>? ORDER BY created_at DESC").all(Date.now()));
} else if (command === "owners") {
  console.table(db.prepare("SELECT owner_id AS organizador,owner_name AS nome,COUNT(*) AS compromissos FROM bookings GROUP BY owner_id,owner_name").all());
} else if (["grant", "revoke"].includes(command)) {
  if (!visitor) throw new Error("Informe o ID do navegador listado pelo comando list.");
  const result = db.prepare("UPDATE agenda_visitors SET is_admin=? WHERE visitor_id=? AND expires_at>?").run(Number(command === "grant"), visitor, Date.now());
  if (!result.changes) throw new Error("Navegador não encontrado ou expirado.");
  console.log(command === "grant" ? "Administração concedida. Atualize a agenda nesse navegador." : "Administração removida.");
} else if (command === "adopt") {
  // Server operator verifies the organizer before linking an old identity.
  if (!visitor || !owner || visitor === owner) throw new Error("Uso: admin adopt <navegador-atual> <organizador-antigo>");
  if (!db.prepare("SELECT 1 FROM bookings WHERE owner_id=? LIMIT 1").get(owner)) throw new Error("Organizador antigo não encontrado.");
  if (db.prepare("SELECT 1 FROM bookings WHERE owner_id=? LIMIT 1").get(visitor)) throw new Error("O navegador atual já criou compromissos. Use um navegador novo para recuperar a identidade antiga.");
  const result = db.prepare("UPDATE agenda_visitors SET visitor_id=?,is_admin=0 WHERE visitor_id=? AND expires_at>?").run(owner, visitor, Date.now());
  if (!result.changes) throw new Error("Navegador não encontrado ou expirado.");
  console.log("Identidade antiga vinculada. Os registros e o histórico não foram modificados.");
} else throw new Error("Comandos: list, owners, grant <navegador>, revoke <navegador>, adopt <navegador-atual> <organizador-antigo>.");
db.close();
