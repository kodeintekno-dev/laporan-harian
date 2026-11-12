import { z } from "zod";
import { authenticateAdmin } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json, readJson } from "../../_lib/http.js";
import { fetchJabatan, STAFF_COLUMNS, throttleKeyPatterns, toStaffView } from "../../_lib/staff.js";

const schema = z.object({ id: z.number("id tidak valid.").int().positive() });

/**
 * Hapus Password Cadangan Staff. Fallback login nomor telepon mati sampai Staff membuat yang baru.
 * Menaikkan session_epoch sehingga semua sesi aktif Staff langsung mati.
 * Menghapus kunci login supaya akun yang terkunci bisa masuk lagi lewat Google.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { id } = parsed.data;

  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE staff
          SET password_hash = NULL, session_epoch = session_epoch + 1
          WHERE id = ? AND status IN ('aktif', 'nonaktif') RETURNING ${STAFF_COLUMNS}`,
    args: [id],
  });
  if (result.rows.length === 0) return fail(404, "Staff tidak ditemukan.");

  const jabatanMap = await fetchJabatan(db, [id]);
  const staff = toStaffView(result.rows[0], jabatanMap.get(id) ?? []);
  const { exact, likeLogin } = throttleKeyPatterns(staff.phone, staff.id);
  await db.batch(
    [
      ...exact.map((key) => ({ sql: "DELETE FROM login_attempt WHERE key = ?", args: [key] })),
      { sql: "DELETE FROM login_attempt WHERE key LIKE ? ESCAPE '\\'", args: [likeLogin] },
    ],
    "write",
  );
  return json({ staff });
}
