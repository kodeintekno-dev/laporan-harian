import { z } from "zod";
import { dateSchema, logIfChanged, reasonSchema, staffIdSchema } from "../../../_lib/admin.js";
import { authenticateAdmin } from "../../../_lib/auth.js";
import { getDb } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";

const schema = z.object({ staffId: staffIdSchema, date: dateSchema, reason: reasonSchema });

/** Mencabut tanda Tidak Hadir. Alasan wajib dan dicatat di Log Koreksi bersama isi tanda sebelumnya. */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { staffId, date, reason } = parsed.data;

  const db = getDb();
  const existing = await db.execute({
    sql: "SELECT category, note FROM absence WHERE staff_id = ? AND absence_date = ?",
    args: [staffId, date],
  });
  const row = existing.rows[0];
  if (!row) return fail(404, "Tanda Tidak Hadir tidak ditemukan.");

  const before = { category: String(row.category), note: row.note == null ? null : String(row.note) };
  const [result] = await db.batch(
    [
      { sql: "DELETE FROM absence WHERE staff_id = ? AND absence_date = ?", args: [staffId, date] },
      logIfChanged({ type: "tidak_hadir", staffId, date, action: "cabut", reason, before, after: null, now: Date.now() }),
    ],
    "write",
  );
  if (result.rowsAffected === 0) return fail(404, "Tanda Tidak Hadir tidak ditemukan.");
  return json({ revoked: true });
}
