import { authenticate } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json } from "../../_lib/http.js";
import { toReportView } from "../../_lib/report.js";
import { dateWib, isWeekend } from "../../_lib/time.js";

/** Status hari ini bagi Staff yang sedang login: sudah kirim, Tidak Hadir, dibatalkan, atau belum. */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "staff") return fail(403, "Hanya untuk Staff.");

  const date = dateWib();
  const db = getDb();
  const [reportRes, absenceRes] = await db.batch(
    [
      {
        sql: `SELECT report_date, tasks_json, note, submitted_at, source, status
              FROM daily_report WHERE staff_id = ? AND report_date = ?`,
        args: [auth.staff.id, date],
      },
      {
        sql: "SELECT category FROM absence WHERE staff_id = ? AND absence_date = ?",
        args: [auth.staff.id, date],
      },
    ],
    "read",
  );

  const row = reportRes.rows[0];
  const cancelled = row ? String(row.status) === "dibatalkan" : false;
  return json({
    date,
    isWeekend: isWeekend(date),
    report: row && !cancelled ? toReportView(row) : null,
    cancelled,
    absence: absenceRes.rows[0] ? { category: String(absenceRes.rows[0].category) } : null,
  });
}
