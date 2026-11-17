import { z } from "zod";
import { authenticateAdmin, canManageStaffSql, denyRestrictedTarget } from "../../../_lib/auth.js";
import { getDb, isUniqueViolation } from "../../../_lib/db.js";
import { fail, json, readJson } from "../../../_lib/http.js";
import { hashPassword, newPasswordSchema } from "../../../_lib/password.js";
import { phoneSchema } from "../../../_lib/phone.js";
import { fetchJabatan, fullNameSchema, STAFF_COLUMNS, toStaffView } from "../../../_lib/staff.js";
export async function GET(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const db = getDb();
  const result = await db.execute(
    `SELECT ${STAFF_COLUMNS} FROM staff WHERE ${admin.staffId === null ? '1' : 'is_admin = 0'} ORDER BY
      CASE status WHEN 'menunggu' THEN 0 WHEN 'aktif' THEN 1 WHEN 'nonaktif' THEN 2 ELSE 3 END,
      full_name COLLATE NOCASE, id`,
  );
  const ids = result.rows.map((r) => Number(r.id));
  const jabatanMap = await fetchJabatan(db, ids);
  return json({ items: result.rows.map((r) => toStaffView(r, jabatanMap.get(Number(r.id)) ?? [])) });
}

const createSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  password: newPasswordSchema,
});

export async function PUT(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;
  const parsed = await readJson(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const { fullName, phone, password } = parsed.data;
  const now = Date.now();
  try {
    const result = await getDb().execute({
      sql: `INSERT INTO staff (email, full_name, display_name, phone, password_hash, initial_password, status, created_at, decided_at)
            SELECT '', ?, ?, ?, ?, 1, 'aktif', ?, ? WHERE ${canManageStaffSql(admin.staffId)}
            RETURNING ${STAFF_COLUMNS}`,
      args: [fullName, fullName.slice(0, 60), phone, await hashPassword(password), now, now],
    });
    if (!result.rows[0]) return fail(403, "Hanya untuk Admin.");
    return json({ staff: toStaffView(result.rows[0]) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "Nomor telepon sudah digunakan.");
    throw error;
  }
}

const decideSchema = z.object({
  id: z.number("id tidak valid.").int().positive(),
  action: z.enum(["setujui", "tolak"]),
});

const linkSchema = z.object({
  pendaftarId: z.number("pendaftarId tidak valid.").int().positive(),
  staffId: z.number("staffId tidak valid.").int().positive(),
});

/**
 * Dua operasi lewat satu endpoint, dibedakan oleh field `action`:
 * - `setujui` / `tolak`: Admin memutuskan Pendaftar.
 * - `link`: Admin menautkan Pendaftar ke Staff yang sudah ada (Staff ganti akun Google).
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await authenticateAdmin(request);
  if (admin instanceof Response) return admin;

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") return fail(400, "Permintaan tidak valid.");

  if ((raw as Record<string, unknown>).action === "link") {
    const parsed = linkSchema.safeParse(raw);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Permintaan tidak valid.");
    const { pendaftarId, staffId } = parsed.data;
    const denied = await denyRestrictedTarget(admin.staffId, staffId);
    if (denied) return denied;
    const permission = canManageStaffSql(admin.staffId, staffId);

    const db = getDb();
    const [pRow, sRow] = await Promise.all([
      db.execute({ sql: "SELECT google_sub FROM staff WHERE id = ? AND status = 'menunggu'", args: [pendaftarId] }),
      db.execute({ sql: "SELECT id FROM staff WHERE id = ? AND status IN ('aktif','nonaktif')", args: [staffId] }),
    ]);
    if (!pRow.rows[0]) return fail(404, "Pendaftar tidak ditemukan atau bukan berstatus menunggu.");
    if (!sRow.rows[0]) return fail(404, "Staff tujuan tidak ditemukan.");

    const now = Date.now();
    try {
      const [removed] = await db.batch(
        [
          // DELETE Pendaftar dulu agar UNIQUE constraint google_sub tidak konflik saat UPDATE.
          { sql: `DELETE FROM staff WHERE id = ? AND status = 'menunggu' AND google_sub = ? AND ${permission}`,
            args: [pendaftarId, String(pRow.rows[0].google_sub)] },
          {
            sql: "UPDATE staff SET google_sub = ?, session_epoch = session_epoch + 1, decided_at = ? WHERE id = ? AND changes() > 0",
            args: [String(pRow.rows[0].google_sub), now, staffId],
          },
        ],
        "write",
      );
      if (!removed.rowsAffected) return fail(409, "Status akun berubah. Muat ulang dan coba lagi.");
    } catch (error) {
      if (isUniqueViolation(error)) return fail(409, "Akun Google ini sudah tertaut ke Staff lain.");
      throw error;
    }
    const result = await db.execute({ sql: `SELECT ${STAFF_COLUMNS} FROM staff WHERE id = ?`, args: [staffId] });
    const jabatanMap = await fetchJabatan(db, [staffId]);
    return json({ staff: toStaffView(result.rows[0], jabatanMap.get(staffId) ?? []) });
  }

  const parsed = decideSchema.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Permintaan tidak valid.");
  const { id, action } = parsed.data;

  const db = getDb();
  const now = Date.now();
  if (action === "setujui") {
    const result = await db.execute({
      sql: `UPDATE staff SET status = 'aktif', decided_at = ? WHERE id = ? AND status = 'menunggu' AND ${canManageStaffSql(admin.staffId, id)} RETURNING ${STAFF_COLUMNS}`,
      args: [now, id],
    });
    if (result.rows.length === 0) return fail(404, "Pendaftar tidak ditemukan atau bukan berstatus menunggu.");
    return json({ staff: toStaffView(result.rows[0]) });
  }

  // action === "tolak"
  const result = await db.execute({
    sql: `UPDATE staff SET status = 'ditolak', decided_at = ? WHERE id = ? AND status = 'menunggu' AND ${canManageStaffSql(admin.staffId, id)} RETURNING ${STAFF_COLUMNS}`,
    args: [now, id],
  });
  if (result.rows.length === 0) return fail(404, "Pendaftar tidak ditemukan atau bukan berstatus menunggu.");
  return json({ staff: toStaffView(result.rows[0]) });
}
