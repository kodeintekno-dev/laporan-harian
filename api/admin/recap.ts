import { authenticateAdmin } from "../_lib/auth.js";
import { readQueryDate } from "../_lib/admin.js";
import { getDb } from "../_lib/db.js";
import { fail, json } from "../_lib/http.js";
import { toReportView, type ReportView } from "../_lib/report.js";
import { dateWib, isWeekend } from "../_lib/time.js";

export type RecapStatus = "terkirim" | "diisi_admin" | "tidak_hadir" | "belum_mengirim";

type RecapRow = {
  staffId: number;
  identifier: string;
  fullName: string;
  status: RecapStatus;
  report: ReportView | null;
  absence: { category: string; note: string | null } | null;
  /** Ada laporan Dibatalkan pada tanggal ini: Staff tidak bisa mengirim ulang. */
  cancelled: boolean;
};

/**
 * Rekap satu tanggal (default hari ini WIB). Isinya Staff Aktif, ditambah Staff nonaktif yang punya
 * laporan atau Tidak Hadir pada tanggal itu. Laporan Dibatalkan tidak dihitung sebagai laporan.
 * Di akhir pekan hanya Staff Piket (yang melapor) dan yang ditandai Tidak Hadir yang tampil,
 * tanpa baris "Belum Mengirim".
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const queryDate = readQueryDate(new URL(request.url), "date");
  if (!queryDate.ok) return fail(400, queryDate.message);
  const date = queryDate.value ?? dateWib();
  const weekend = isWeekend(date);

  const db = getDb();
  const [staffRes, reportRes, absenceRes] = await Promise.all([
    db.execute("SELECT id, email, full_name, display_name, status FROM staff ORDER BY full_name COLLATE NOCASE, id"),
    db.execute({
      sql: `SELECT staff_id, report_date, tasks_json, note, submitted_at, source, status
            FROM daily_report WHERE report_date = ?`,
      args: [date],
    }),
    db.execute({ sql: "SELECT staff_id, category, note FROM absence WHERE absence_date = ?", args: [date] }),
  ]);

  const reports = new Map(reportRes.rows.map((r) => [Number(r.staff_id), r]));
  const absences = new Map(absenceRes.rows.map((r) => [Number(r.staff_id), r]));

  const rows: RecapRow[] = [];
  for (const s of staffRes.rows) {
    const staffId = Number(s.id);
    const isActive = String(s.status) === "aktif";
    const displayName = s.display_name == null || String(s.display_name).trim() === "" ? null : String(s.display_name);
    const identifier = displayName ?? String(s.email);
    const reportRow = reports.get(staffId);
    const activeReport = reportRow && String(reportRow.status) === "aktif" ? reportRow : undefined;
    const absenceRow = absences.get(staffId);

    let status: RecapStatus;
    if (absenceRow) status = "tidak_hadir";
    else if (activeReport) status = String(activeReport.source) === "admin" ? "diisi_admin" : "terkirim";
    else if (isActive && !weekend) status = "belum_mengirim";
    else continue;

    rows.push({
      staffId,
      identifier,
      fullName: String(s.full_name),
      status,
      report: activeReport ? toReportView(activeReport) : null,
      absence: absenceRow ? { category: String(absenceRow.category), note: absenceRow.note == null ? null : String(absenceRow.note) } : null,
      cancelled: !!reportRow && !activeReport,
    });
  }

  const count = (status: RecapStatus) => rows.filter((r) => r.status === status).length;
  return json({
    date,
    isWeekend: weekend,
    rows,
    summary: {
      terkirim: count("terkirim"),
      diisiAdmin: count("diisi_admin"),
      tidakHadir: count("tidak_hadir"),
      belumMengirim: count("belum_mengirim"),
    },
  });
}
