import { z } from "zod";
import { authenticateAdmin } from "../../../_lib/auth.js";
import { getDb } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";
import { STAFF_COLUMNS, toStaffView } from "../../../_lib/staff.js";

const schema = z.object({ id: z.number("id tidak valid.").int().positive() });

/**
 * Lepas tautan Google dari Staff. Setelah ini Staff hanya bisa masuk lewat nomor telepon dan Password Cadangan.
 * Menaikkan session_epoch sehingga semua sesi aktif Staff langsung mati.
 * Staff bisa menautkan akun Google baru dengan mendaftar ulang, lalu Admin memilih "Tautkan ke Staff yang ada".
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { id } = parsed.data;

  const result = await getDb().execute({
    sql: `UPDATE staff
          SET google_sub = NULL, session_epoch = session_epoch + 1
          WHERE id = ? AND status IN ('aktif', 'nonaktif') RETURNING ${STAFF_COLUMNS}`,
    args: [id],
  });
  if (result.rows.length === 0) return fail(404, "Staff tidak ditemukan.");
  return json({ staff: toStaffView(result.rows[0]) });
}
