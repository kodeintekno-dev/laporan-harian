import { z } from "zod";
import { authenticateAdmin } from "../../../_lib/auth.js";
import { getDb } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";
import { addDays, dateWib } from "../../../_lib/time.js";

const schema = z.object({
  id: z.number().int().positive(),
  isAdmin: z.boolean(),
  monitoringOnly: z.boolean(),
});

export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;
  if (admin.staffId !== null) return fail(403, "Hanya Superadmin yang dapat mengubah peran.");

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { id, isAdmin, monitoringOnly } = parsed.data;
  const exempt = Number(isAdmin && monitoringOnly);
  const effectiveDate = addDays(dateWib(), 1);
  const [updated] = await getDb().batch([
    {
      sql: `UPDATE staff SET is_admin = ?, monitoring_only = ?
            WHERE id = ? AND status IN ('aktif', 'nonaktif') AND (? = 0 OR initial_password = 0)`,
      args: [Number(isAdmin), exempt, id, Number(isAdmin)],
    },
    {
      sql: `INSERT INTO reporting_policy (staff_id, effective_date, exempt)
            SELECT ?, ?, ? WHERE changes() > 0
            ON CONFLICT (staff_id, effective_date) DO UPDATE SET exempt = excluded.exempt`,
      args: [id, effectiveDate, exempt],
    },
  ], "write");
  if (!updated.rowsAffected) {
    const result = await getDb().execute({
      sql: "SELECT initial_password FROM staff WHERE id = ? AND status IN ('aktif', 'nonaktif')",
      args: [id],
    });
    if (isAdmin && Number(result.rows[0]?.initial_password) === 1) {
      return fail(409, "Pemilik akun harus mengganti password awal sebelum dipromosikan menjadi Admin.");
    }
    return fail(404, "Akun tidak ditemukan.");
  }
  return json({ ok: true, effectiveDate });
}
