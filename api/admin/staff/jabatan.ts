import { z } from "zod";
import { authenticateAdmin } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json, readJson } from "../../_lib/http.js";
import { fetchJabatan, JABATAN_LIST, MAX_JABATAN, setJabatan, STAFF_COLUMNS, toStaffView } from "../../_lib/staff.js";

const schema = z.object({
  id: z.number("id tidak valid.").int().positive(),
  jabatan: z
    .array(z.string())
    .max(MAX_JABATAN, `Maksimal ${MAX_JABATAN} jabatan per Staff.`)
    .refine(
      (arr) => arr.every((n) => (JABATAN_LIST as readonly string[]).includes(n)),
      "Terdapat jabatan yang tidak valid.",
    ),
});

/**
 * Mengganti jabatan satu Staff.
 * Body: { id: number, jabatan: string[] }
 * Jabatan harus dari JABATAN_LIST, maks MAX_JABATAN item.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { id, jabatan } = parsed.data;

  const db = getDb();
  // Pastikan Staff ada
  const staffRow = await db.execute({ sql: `SELECT ${STAFF_COLUMNS} FROM staff WHERE id = ?`, args: [id] });
  if (staffRow.rows.length === 0) return fail(404, "Staff tidak ditemukan.");

  const err = await setJabatan(db, id, jabatan);
  if (err) return fail(400, err.error);

  const jabatanMap = await fetchJabatan(db, [id]);
  return json({ staff: toStaffView(staffRow.rows[0], jabatanMap.get(id) ?? []) });
}
