import { json } from "../_lib/http.js";
import { clearedSessionCookie } from "../_lib/session.js";

// Tanpa pemeriksaan sesi: menghapus cookie yang tidak ada tidak berbahaya.
export async function POST(): Promise<Response> {
  return json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
}
