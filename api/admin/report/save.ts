import { z } from "zod";
import { dateSchema, logIfChanged, reasonSchema, staffIdSchema } from "../../_lib/admin.js";
import { authenticateAdmin } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json, readJson } from "../../_lib/http.js";
import { reportInputSchema, toReportView } from "../../_lib/report.js";
import { dateWib } from "../../_lib/time.js";

const schema = reportInputSchema.safeExtend({ staffId: staffIdSchema, date: dateSchema, reason: reasonSchema });

/**
 * Koreksi laporan oleh Admin: membuat atau mengubah laporan untuk tanggal yang sudah lewat atau hari ini.
 * Tidak ada batas ke belakang, tanggal masa depan ditolak. Alasan wajib.
 * - Laporan baru atau yang menggantikan laporan Dibatalkan: sumbernya 'admin', Waktu Keluar = waktu koreksi.
 * - Laporan aktif yang diubah: Waktu Keluar dan sumber asli dipertahankan.
 * Tanggal yang ditandai Tidak Hadir ditolak (cabut tandanya dulu).
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { staffId, date, reason, tasks, note } = parsed.data;

  const now = Date.now();
  if (date > dateWib(now)) return fail(400, "Tanggal laporan tidak boleh di masa depan.");

  const db = getDb();
  const staff = await db.execute({ sql: "SELECT 1 FROM staff WHERE id = ?", args: [staffId] });
  if (staff.rows.length === 0) return fail(404, "Staff tidak ditemukan.");

  const existing = await db.execute({
    sql: `SELECT report_date, tasks_json, note, submitted_at, source, status
          FROM daily_report WHERE staff_id = ? AND report_date = ?`,
    args: [staffId, date],
  });
  const row = existing.rows[0];
  const before = row ? { ...toReportView(row), status: String(row.status) } : null;

  const [result] = await db.batch(
    [
      {
        sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
              SELECT ?, ?, ?, ?, ?, 'admin', 'aktif'
              WHERE NOT EXISTS (SELECT 1 FROM absence WHERE staff_id = ? AND absence_date = ?)
              ON CONFLICT (staff_id, report_date) DO UPDATE SET
                tasks_json = excluded.tasks_json,
                note = excluded.note,
                submitted_at = CASE WHEN daily_report.status = 'dibatalkan' THEN excluded.submitted_at ELSE daily_report.submitted_at END,
                source = CASE WHEN daily_report.status = 'dibatalkan' THEN 'admin' ELSE daily_report.source END,
                status = 'aktif'`,
        args: [staffId, date, JSON.stringify(tasks), note, now, staffId, date],
      },
      logIfChanged({
        type: "laporan",
        staffId,
        date,
        action: before ? "ubah" : "buat",
        reason,
        before,
        after: { tasks, note },
        now,
      }),
    ],
    "write",
  );
  if (result.rowsAffected === 0) {
    return fail(409, "Staff ditandai Tidak Hadir pada tanggal itu. Cabut tandanya lebih dulu.");
  }

  const saved = await db.execute({
    sql: `SELECT report_date, tasks_json, note, submitted_at, source
          FROM daily_report WHERE staff_id = ? AND report_date = ?`,
    args: [staffId, date],
  });
  return json({ report: toReportView(saved.rows[0]) }, { status: before ? 200 : 201 });
}
