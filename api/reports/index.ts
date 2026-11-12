import { authenticate } from "../_lib/auth.js";
import { getDb, isUniqueViolation } from "../_lib/db.js";
import { fail, json, readJson } from "../_lib/http.js";
import { reportInputSchema, type ReportView } from "../_lib/report.js";
import { dateWib } from "../_lib/time.js";

/**
 * Staff mengirim Laporan Harian untuk hari ini (WIB). Waktu Keluar = waktu server saat ini.
 * Tanggal tidak pernah diterima dari klien. Laporan yang sudah terkirim tidak bisa diubah Staff.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "staff") return fail(403, "Hanya Staff yang dapat mengirim Laporan Harian.");

  const parsed = await readJson(request, reportInputSchema);
  if (!parsed.ok) return parsed.response;
  const { tasks, note } = parsed.data;

  const now = Date.now();
  const date = dateWib(now);
  const db = getDb();
  const staffId = auth.staff.id;

  try {
    // Satu pernyataan atomik: tidak menyisipkan jika Admin sudah menandai Tidak Hadir hari ini.
    const result = await db.execute({
      sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
            SELECT ?, ?, ?, ?, ?, 'staff', 'aktif'
            WHERE NOT EXISTS (SELECT 1 FROM absence WHERE staff_id = ? AND absence_date = ?)`,
      args: [staffId, date, JSON.stringify(tasks), note, now, staffId, date],
    });
    if (result.rowsAffected === 0) {
      return fail(409, "Anda ditandai Tidak Hadir hari ini, jadi tidak perlu mengirim laporan.");
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await db.execute({
      sql: "SELECT status FROM daily_report WHERE staff_id = ? AND report_date = ?",
      args: [staffId, date],
    });
    const cancelled = String(existing.rows[0]?.status) === "dibatalkan";
    return fail(
      409,
      cancelled
        ? "Laporan hari ini dibatalkan Admin dan tidak bisa dikirim ulang. Hubungi Admin."
        : "Laporan hari ini sudah terkirim.",
    );
  }

  const report: ReportView = { reportDate: date, tasks, note, submittedAt: now, source: "staff" };
  return json({ report }, { status: 201 });
}
