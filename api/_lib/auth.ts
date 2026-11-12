import { getDb } from "./db.js";
import { fail } from "./http.js";
import { adminFingerprint, readSessionToken, verifySession } from "./session.js";

export type StaffStatus = "menunggu" | "aktif" | "ditolak" | "nonaktif";

export type StaffInfo = {
  id: number;
  email: string;
  fullName: string;
  displayName: string | null;
  /** Pengenal di Rekap, riwayat, dan CSV: Display Name jika ada, jika tidak Email Google. */
  identifier: string;
  status: StaffStatus;
  hasBackupPassword: boolean;
};

export type AuthContext =
  | { role: "admin"; username: string }
  | { role: "staff"; staff: StaffInfo };

/**
 * Satu-satunya pintu masuk untuk endpoint yang butuh login. Setiap endpoint selain login/logout
 * wajib memanggil ini dan mengembalikan hasilnya jika berupa Response.
 *
 * Token tidak dipercaya begitu saja: akun Staff dicek ulang ke database di setiap request,
 * sehingga menonaktifkan akun atau mengganti password langsung mematikan sesi lama.
 */
export async function authenticate(
  request: Request,
  options: { allowPending?: boolean } = {},
): Promise<AuthContext | Response> {
  const unauthenticated = () => fail(401, "Sesi tidak valid. Silakan login kembali.");

  const token = readSessionToken(request);
  if (!token) return unauthenticated();
  const session = await verifySession(token);
  if (!session) return unauthenticated();

  if (session.role === "admin") {
    const username = process.env.ADMIN_USERNAME?.trim();
    if (!username || session.pv !== adminFingerprint()) return unauthenticated();
    return { role: "admin", username };
  }

  const result = await getDb().execute({
    sql: `SELECT id, email, full_name, display_name, status, session_epoch, password_hash
          FROM staff WHERE id = ?`,
    args: [session.staffId],
  });
  const row = result.rows[0];
  // Sesi dicabut jika epoch berubah atau akun dinonaktifkan.
  if (!row || Number(row.session_epoch) !== session.ep || String(row.status) === "nonaktif") {
    return unauthenticated();
  }

  const email = String(row.email);
  const displayName = row.display_name == null || String(row.display_name).trim() === "" ? null : String(row.display_name);
  const staff: StaffInfo = {
    id: Number(row.id),
    email,
    fullName: String(row.full_name),
    displayName,
    identifier: displayName ?? email,
    status: String(row.status) as StaffStatus,
    hasBackupPassword: row.password_hash != null,
  };
  // Pendaftar (menunggu) dan yang ditolak hanya boleh melihat statusnya sendiri.
  if (staff.status !== "aktif" && !options.allowPending) {
    return fail(403, "Akun Anda belum disetujui Admin.", { code: "not_approved", status: staff.status });
  }
  return { role: "staff", staff };
}

/** Untuk endpoint khusus Admin. Staff yang login mendapat 403. */
export async function authenticateAdmin(request: Request): Promise<{ username: string } | Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (auth.role !== "admin") return fail(403, "Hanya untuk Admin.");
  return { username: auth.username };
}
