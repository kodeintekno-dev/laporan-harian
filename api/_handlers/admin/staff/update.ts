import { z } from "zod";
import { authenticateAdmin } from "../../../_lib/auth.js";
import { getDb } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";
import { displayNameSchema, fetchJabatan, fullNameSchema, STAFF_COLUMNS, toStaffView } from "../../../_lib/staff.js";

const schema = z
  .object({
    id: z.number("id tidak valid.").int().positive(),
    fullName: fullNameSchema.optional(),
    displayName: displayNameSchema,
    status: z.enum(["aktif", "nonaktif"]).optional(),
  })
  .refine(
    (v) => v.fullName !== undefined || v.displayName !== undefined || v.status !== undefined,
    "Tidak ada yang diubah.",
  );

/**
 * Mengubah nama lengkap, Display Name, dan/atau status Staff.
 * Menonaktifkan menaikkan session_epoch sehingga semua sesi aktif Staff langsung mati.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { id, fullName, displayName, status } = parsed.data;

  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE staff
          SET full_name = COALESCE(?, full_name),
              display_name = CASE WHEN ? THEN ? ELSE display_name END,
              status = COALESCE(?, status),
              session_epoch = CASE WHEN ? = 'nonaktif' THEN session_epoch + 1 ELSE session_epoch END
          WHERE id = ? AND status IN ('aktif', 'nonaktif')
          RETURNING ${STAFF_COLUMNS}`,
    args: [
      fullName ?? null,
      displayName !== undefined ? 1 : 0,
      displayName ?? null,
      status ?? null,
      status ?? null,
      id,
    ],
  });
  if (result.rows.length === 0) return fail(404, "Staff tidak ditemukan.");
  const jabatanMap = await fetchJabatan(db, [id]);
  return json({ staff: toStaffView(result.rows[0], jabatanMap.get(id) ?? []) });
}
