import { z } from "zod";
import { authenticate } from "../_lib/auth.js";
import { getDb } from "../_lib/db.js";
import { fail, json, readJson } from "../_lib/http.js";
import { hashPassword, newPasswordSchema, verifyPassword } from "../_lib/password.js";
import { sessionCookie, signSession } from "../_lib/session.js";
import { clearFailures, lockRemainingMs, recordFailure } from "../_lib/throttle.js";

/**
 * Buat atau ubah Password Cadangan (fallback login nomor telepon).
 * - Membuat pertama kali: currentPassword boleh kosong (null/undefined).
 * - Mengubah yang sudah ada: currentPassword wajib diisi dan harus cocok.
 */
const schema = z.object({
  currentPassword: z.string().optional().nullable(),
  newPassword: newPasswordSchema,
});

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "staff") {
    return fail(403, "Password Admin diganti lewat variabel lingkungan, bukan lewat aplikasi.");
  }

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, newPassword } = parsed.data;

  const now = Date.now();
  const key = `chgpw|${auth.staff.id}`;
  const remaining = await lockRemainingMs(key, now);
  if (remaining > 0) {
    const minutes = Math.ceil(remaining / 60_000);
    return fail(429, `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`, {
      retryAfterSeconds: Math.ceil(remaining / 1000),
    });
  }

  const db = getDb();
  const result = await db.execute({
    sql: "SELECT password_hash, session_epoch FROM staff WHERE id = ?",
    args: [auth.staff.id],
  });
  const row = result.rows[0];
  const existingHash = row?.password_hash != null ? String(row.password_hash) : null;

  if (existingHash) {
    // Mengubah password yang sudah ada: wajib verifikasi password lama.
    if (!currentPassword) return fail(400, "Password saat ini wajib diisi untuk mengubah Password Cadangan.");
    if (currentPassword === newPassword) return fail(400, "Password baru harus berbeda dari password saat ini.");
    if (!(await verifyPassword(currentPassword, existingHash))) {
      await recordFailure(key, now);
      return fail(400, "Password saat ini salah.");
    }
  }
  await clearFailures(key);

  // Naikkan session_epoch supaya semua sesi lama dicabut, lalu terbitkan sesi baru.
  const newEpoch = Number(row?.session_epoch ?? 0) + 1;
  await db.execute({
    sql: "UPDATE staff SET password_hash = ?, session_epoch = ? WHERE id = ?",
    args: [await hashPassword(newPassword), newEpoch, auth.staff.id],
  });

  const token = await signSession({ role: "staff", staffId: auth.staff.id, ep: newEpoch });
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token) } });
}
