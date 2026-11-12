import { authenticateAdmin } from "../../_lib/auth.js";
import { readQueryDate } from "../../_lib/admin.js";
import { getDb } from "../../_lib/db.js";
import { fail, json } from "../../_lib/http.js";
import { toReportView } from "../../_lib/report.js";

const PAGE_SIZE = 31;

/**
 * Riwayat satu Staff untuk Admin, terbaru dulu, per tanggal. Berbeda dari riwayat Staff,
 * di sini laporan Dibatalkan ikut tampil (dengan status) dan catatan Admin pada Tidak Hadir terlihat.
 * Kursor: `?before=YYYY-MM-DD`.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const staffId = Number(url.searchParams.get("staffId"));
  if (!Number.isInteger(staffId) || staffId <= 0) return fail(400, "Parameter staffId tidak valid.");
  const before = readQueryDate(url, "before");
  if (!before.ok) return fail(400, before.message);

  const db = getDb();
  const staff = await db.execute({ sql: "SELECT id, email, full_name, display_name, status FROM staff WHERE id = ?", args: [staffId] });
  if (staff.rows.length === 0) return fail(404, "Staff tidak ditemukan.");

  // Tiap sumber diambil PAGE_SIZE+1 tanggal teratas; gabungannya pasti memuat PAGE_SIZE+1 tanggal teratas.
  const [reportRes, absenceRes] = await Promise.all([
    db.execute({
      sql: `SELECT report_date, tasks_json, note, submitted_at, source, status
            FROM daily_report WHERE staff_id = ? AND (? IS NULL OR report_date < ?)
            ORDER BY report_date DESC LIMIT ?`,
      args: [staffId, before.value, before.value, PAGE_SIZE + 1],
    }),
    db.execute({
      sql: `SELECT absence_date, category, note FROM absence
            WHERE staff_id = ? AND (? IS NULL OR absence_date < ?)
            ORDER BY absence_date DESC LIMIT ?`,
      args: [staffId, before.value, before.value, PAGE_SIZE + 1],
    }),
  ]);

  type Item = {
    date: string;
    report: (ReturnType<typeof toReportView> & { status: "aktif" | "dibatalkan" }) | null;
    absence: { category: string; note: string | null } | null;
  };
  const byDate = new Map<string, Item>();
  const slot = (date: string): Item => {
    let item = byDate.get(date);
    if (!item) byDate.set(date, (item = { date, report: null, absence: null }));
    return item;
  };
  for (const r of reportRes.rows) {
    slot(String(r.report_date)).report = { ...toReportView(r), status: String(r.status) === "dibatalkan" ? "dibatalkan" : "aktif" };
  }
  for (const a of absenceRes.rows) {
    slot(String(a.absence_date)).absence = { category: String(a.category), note: a.note == null ? null : String(a.note) };
  }

  const dates = [...byDate.keys()].sort().reverse();
  const items = dates.slice(0, PAGE_SIZE).map((d) => byDate.get(d)!);
  const s = staff.rows[0];
  const displayName = s.display_name == null || String(s.display_name).trim() === "" ? null : String(s.display_name);
  return json({
    staff: {
      id: Number(s.id),
      email: String(s.email),
      fullName: String(s.full_name),
      displayName,
      identifier: displayName ?? String(s.email),
      status: String(s.status),
    },
    items,
    nextBefore: dates.length > PAGE_SIZE ? items[items.length - 1].date : null,
  });
}
