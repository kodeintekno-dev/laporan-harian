import { authenticate } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { fail, json } from "../../_lib/http.js";
import { toReportView } from "../../_lib/report.js";

const PAGE_SIZE = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Riwayat Laporan Harian milik Staff yang login, terbaru dulu. Laporan Dibatalkan tidak tampil.
 * Paginasi dengan kursor tanggal: `?before=YYYY-MM-DD` mengambil laporan sebelum tanggal itu.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "staff") return fail(403, "Hanya untuk Staff.");

  const before = new URL(request.url).searchParams.get("before");
  if (before !== null && !DATE_PATTERN.test(before)) return fail(400, "Parameter before tidak valid.");

  const result = await getDb().execute({
    sql: `SELECT report_date, tasks_json, note, submitted_at, source
          FROM daily_report
          WHERE staff_id = ? AND status = 'aktif' AND (? IS NULL OR report_date < ?)
          ORDER BY report_date DESC
          LIMIT ?`,
    args: [auth.staff.id, before, before, PAGE_SIZE + 1],
  });

  const hasMore = result.rows.length > PAGE_SIZE;
  const items = result.rows.slice(0, PAGE_SIZE).map(toReportView);
  const nextBefore = hasMore ? items[items.length - 1].reportDate : null;

  // Tanda Tidak Hadir yang jatuh di rentang halaman ini: sebelum kursor, dan (bila masih ada halaman
  // berikutnya) tidak lebih lama dari laporan terakhir di halaman. Hanya kategori; catatan Admin tidak pernah dikirim.
  const absenceRes = await getDb().execute({
    sql: `SELECT absence_date, category FROM absence
          WHERE staff_id = ? AND (? IS NULL OR absence_date < ?) AND (? IS NULL OR absence_date >= ?)
          ORDER BY absence_date DESC`,
    args: [auth.staff.id, before, before, nextBefore, nextBefore],
  });
  const absences = absenceRes.rows.map((r) => ({ date: String(r.absence_date), category: String(r.category) }));

  return json({ items, absences, nextBefore });
}
