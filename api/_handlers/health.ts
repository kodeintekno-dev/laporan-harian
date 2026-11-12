import { getDb } from "../_lib/db.js";

// Sengaja tanpa autentikasi (untuk cek deploy), dan tidak mengembalikan data apa pun selain status.
export async function GET(): Promise<Response> {
  try {
    await getDb().execute("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
