import { authenticateAdmin } from "../../_lib/auth.js";
import { readQueryDate } from "../../_lib/admin.js";
import { csvLine, formatWib } from "../../_lib/csv.js";
import { getDb } from "../../_lib/db.js";
import { fail } from "../../_lib/http.js";
import { addDays } from "../../_lib/time.js";

const MAX_RANGE_DAYS = 366;

/**
 * Ekspor CSV untuk rentang tanggal (`?from=&to=`, keduanya wajib, maksimal 366 hari).
 * Berisi laporan aktif dan Tidak Hadir. Laporan Dibatalkan tidak diekspor.
 * Sel diamankan dari injeksi rumus. BOM UTF-8 ditambahkan agar Excel membaca huruf dengan benar.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const from = readQueryDate(url, "from");
  if (!from.ok) return fail(400, from.message);
  const to = readQueryDate(url, "to");
  if (!to.ok) return fail(400, to.message);
  if (!from.value || !to.value) return fail(400, "Parameter from dan to wajib diisi.");
  if (to.value < from.value) return fail(400, "Tanggal akhir tidak boleh sebelum tanggal awal.");
  if (to.value > addDays(from.value, MAX_RANGE_DAYS - 1)) return fail(400, `Rentang maksimal ${MAX_RANGE_DAYS} hari.`);

  const db = getDb();
  const [reports, absences] = await Promise.all([
    db.execute({
      sql: `SELECT r.report_date AS date,
                   r.staff_id,
                   COALESCE(NULLIF(TRIM(s.display_name), ''), s.email) AS identifier,
                   s.full_name, r.source, r.submitted_at, r.tasks_json, r.note
            FROM daily_report r JOIN staff s ON s.id = r.staff_id
            WHERE r.status = 'aktif' AND r.report_date BETWEEN ? AND ?`,
      args: [from.value, to.value],
    }),
    db.execute({
      sql: `SELECT a.absence_date AS date,
                   a.staff_id,
                   COALESCE(NULLIF(TRIM(s.display_name), ''), s.email) AS identifier,
                   s.full_name, a.category, a.note
            FROM absence a JOIN staff s ON s.id = a.staff_id
            WHERE a.absence_date BETWEEN ? AND ?`,
      args: [from.value, to.value],
    }),
  ]);

  // Kumpulkan semua staff_id unik lalu ambil jabatan sekaligus.
  const allStaffIds = [
    ...new Set([
      ...reports.rows.map((r) => Number(r.staff_id)),
      ...absences.rows.map((a) => Number(a.staff_id)),
    ]),
  ];
  const jabatanMap = new Map<number, string>();
  if (allStaffIds.length > 0) {
    const placeholders = allStaffIds.map(() => "?").join(",");
    const jRows = (
      await db.execute({
        sql: `SELECT sj.staff_id, GROUP_CONCAT(j.nama, '; ') AS jabatan_str
              FROM staff_jabatan sj JOIN jabatan j ON j.id = sj.jabatan_id
              WHERE sj.staff_id IN (${placeholders})
              GROUP BY sj.staff_id`,
        args: allStaffIds,
      })
    ).rows;
    for (const r of jRows) jabatanMap.set(Number(r.staff_id), String(r.jabatan_str));
  }

  type Line = { date: string; name: string; cells: string[] };
  const lines: Line[] = [];
  for (const r of reports.rows) {
    const tasks = (JSON.parse(String(r.tasks_json)) as string[]).map((t, i) => `${i + 1}. ${t}`).join("\n");
    const jabatan = jabatanMap.get(Number(r.staff_id)) ?? "";
    lines.push({
      date: String(r.date),
      name: String(r.full_name),
      cells: [
        String(r.date),
        String(r.identifier),
        String(r.full_name),
        jabatan,
        String(r.source) === "admin" ? "Diisi Admin" : "Terkirim",
        formatWib(Number(r.submitted_at)),
        "",
        tasks,
        r.note == null ? "" : String(r.note),
      ],
    });
  }
  for (const a of absences.rows) {
    const jabatan = jabatanMap.get(Number(a.staff_id)) ?? "";
    lines.push({
      date: String(a.date),
      name: String(a.full_name),
      cells: [String(a.date), String(a.identifier), String(a.full_name), jabatan, "Tidak Hadir", "", String(a.category), "", a.note == null ? "" : String(a.note)],
    });
  }
  lines.sort((x, y) => x.date.localeCompare(y.date) || x.name.localeCompare(y.name));

  const header = ["Tanggal", "Pengenal", "Nama", "Jabatan", "Status", "Waktu Keluar (WIB)", "Kategori Tidak Hadir", "Tugas", "Catatan"];
  const body = [csvLine(header), ...lines.map((l) => csvLine(l.cells))].join("\r\n") + "\r\n";
  return new Response("\uFEFF" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-${from.value}_${to.value}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
