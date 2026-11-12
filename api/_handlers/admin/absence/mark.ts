import { z } from "zod";
import { ABSENCE_CATEGORIES, absenceWindow, dateSchema, logIfChanged, staffIdSchema } from "../../../_lib/admin.js";
import { authenticateAdmin } from "../../../_lib/auth.js";
import { getDb } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";
import { addDays, dateWib } from "../../../_lib/time.js";
import { MAX_NOTE_LENGTH } from "../../../../shared/report-limits.js";

const schema = z
  .object({
    staffId: staffIdSchema,
    dateFrom: dateSchema,
    dateTo: dateSchema.optional(),
    category: z.enum(ABSENCE_CATEGORIES, "Kategori tidak valid."),
    note: z
      .string()
      .trim()
      .max(MAX_NOTE_LENGTH, `Catatan maksimal ${MAX_NOTE_LENGTH} karakter.`)
      .nullish()
      .transform((value) => value || null),
  })
  .refine((v) => (v.dateTo ?? v.dateFrom) >= v.dateFrom, "Tanggal akhir tidak boleh sebelum tanggal awal.");

/**
 * Menandai Staff Tidak Hadir untuk satu tanggal atau rentang. Hanya dalam jendela
 * 31 hari ke belakang sampai 100 hari ke depan dari hari ini (WIB). Tanggal yang sudah punya
 * laporan aktif ditolak seluruhnya. Tanggal yang sudah ditandai dilewati. Tiap tanda baru dicatat di Log Koreksi.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { staffId, dateFrom, category, note } = parsed.data;
  const dateTo = parsed.data.dateTo ?? dateFrom;

  const now = Date.now();
  const window = absenceWindow(dateWib(now));
  if (dateFrom < window.min || dateTo > window.max) {
    return fail(400, `Tanggal harus antara ${window.min} dan ${window.max}.`);
  }

  const db = getDb();
  const staff = await db.execute({ sql: "SELECT 1 FROM staff WHERE id = ?", args: [staffId] });
  if (staff.rows.length === 0) return fail(404, "Staff tidak ditemukan.");

  const conflicts = await db.execute({
    sql: `SELECT report_date FROM daily_report
          WHERE staff_id = ? AND status = 'aktif' AND report_date BETWEEN ? AND ?
          ORDER BY report_date`,
    args: [staffId, dateFrom, dateTo],
  });
  if (conflicts.rows.length > 0) {
    const dates = conflicts.rows.map((r) => String(r.report_date));
    return fail(409, `Sudah ada laporan pada ${dates.join(", ")}. Batalkan laporannya lebih dulu.`, { dates });
  }

  const statements = [];
  for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
    // NOT EXISTS menjaga kondisi balapan: laporan yang masuk di antara pemeriksaan dan penyisipan.
    statements.push({
      sql: `INSERT OR IGNORE INTO absence (staff_id, absence_date, category, note, created_at)
            SELECT ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM daily_report WHERE staff_id = ? AND report_date = ? AND status = 'aktif')`,
      args: [staffId, date, category, note, now, staffId, date],
    });
    statements.push(
      logIfChanged({
        type: "tidak_hadir",
        staffId,
        date,
        action: "tandai",
        reason: note ?? "Penandaan Tidak Hadir",
        before: null,
        after: { category, note },
        now,
      }),
    );
  }

  const results = await db.batch(statements, "write");
  const created = results.filter((_, index) => index % 2 === 0).reduce((sum, r) => sum + r.rowsAffected, 0);
  return json({ created, skipped: statements.length / 2 - created }, { status: created > 0 ? 201 : 200 });
}
