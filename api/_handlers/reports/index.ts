import { authenticate } from "../../_lib/auth.js";
import { getDb, isUniqueViolation } from "../../_lib/db.js";
import { fail, json, readJson } from "../../_lib/http.js";
import { reportInputSchema, type ReportView } from "../../_lib/report.js";
import { reportSchedule } from "../../_lib/report-schedule.js";
import { z } from "zod";

const submissionSchema = reportInputSchema.extend({
  expectedDate: z.iso.date("Tanggal formulir tidak valid."),
});

/**
 * Staff mengirim Laporan Harian untuk hari ini (WIB). Waktu Keluar = waktu server saat ini.
 * Tanggal formulir hanya dipakai untuk mendeteksi pengiriman dari periode lama.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "staff") return fail(403, "Hanya Staff yang dapat mengirim Laporan Harian.");

  const parsed = await readJson(request, submissionSchema);
  if (!parsed.ok) return parsed.response;
  const { tasks, note, expectedDate } = parsed.data;

  const now = Date.now();
  const db = getDb();
  const staffId = auth.staff.id;
  const schedule = await reportSchedule(db, staffId, now);
  const { date } = schedule;
  if (expectedDate !== date) return fail(400, "Batas waktu pengiriman untuk tanggal pada formulir ini sudah lewat.");
  if (!schedule.isOpen) return fail(403, `Pengiriman dibuka pukul ${schedule.hours}.`);

  try {
    // Satu pernyataan atomik: tidak menyisipkan jika Admin sudah menandai Tidak Hadir hari ini.
    const result = await db.execute({
      sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
            SELECT ?, ?, ?, ?, ?, 'staff', 'aktif'
            WHERE NOT EXISTS (SELECT 1 FROM absence WHERE staff_id = ? AND absence_date = ?)
              AND COALESCE((SELECT exempt FROM reporting_policy WHERE staff_id = ? AND effective_date <= ?
                            ORDER BY effective_date DESC LIMIT 1), 0) = 0`,
      args: [staffId, date, JSON.stringify(tasks), note, now, staffId, date, staffId, date],
    });
    if (result.rowsAffected === 0) {
      const policy = await db.execute({
        sql: `SELECT exempt FROM reporting_policy WHERE staff_id = ? AND effective_date <= ?
              ORDER BY effective_date DESC LIMIT 1`,
        args: [staffId, date],
      });
      if (Number(policy.rows[0]?.exempt) === 1) {
        return fail(403, "Anda bebas dari kewajiban laporan untuk tanggal ini.");
      }
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
