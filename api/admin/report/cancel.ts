import { z } from "zod";
import { dateSchema, logIfChanged, reasonSchema, staffIdSchema } from "../../_lib/admin.js";
import { authenticateAdmin } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json, readJson } from "../../_lib/http.js";
import { toReportView } from "../../_lib/report.js";

const schema = z.object({ staffId: staffIdSchema, date: dateSchema, reason: reasonSchema });

/**
 * Membatalkan laporan aktif (status Dibatalkan). Barisnya tetap ada, sehingga Staff tidak bisa
 * mengirim ulang sendiri; Admin masih bisa memulihkannya lewat koreksi. Alasan wajib dan dicatat.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { staffId, date, reason } = parsed.data;

  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT report_date, tasks_json, note, submitted_at, source, status
          FROM daily_report WHERE staff_id = ? AND report_date = ? AND status = 'aktif'`,
    args: [staffId, date],
  });
  if (existing.rows.length === 0) return fail(404, "Laporan aktif tidak ditemukan.");

  const before = { ...toReportView(existing.rows[0]), status: "aktif" };
  const [result] = await db.batch(
    [
      {
        sql: `UPDATE daily_report SET status = 'dibatalkan'
              WHERE staff_id = ? AND report_date = ? AND status = 'aktif'`,
        args: [staffId, date],
      },
      logIfChanged({
        type: "laporan",
        staffId,
        date,
        action: "batalkan",
        reason,
        before,
        after: { status: "dibatalkan" },
        now: Date.now(),
      }),
    ],
    "write",
  );
  if (result.rowsAffected === 0) return fail(404, "Laporan aktif tidak ditemukan.");
  return json({ cancelled: true });
}
