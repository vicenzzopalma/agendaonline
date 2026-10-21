declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AGENDA_ADMIN_EMAILS?: string;
  }
}
