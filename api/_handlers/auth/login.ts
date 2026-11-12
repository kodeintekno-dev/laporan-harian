import { z } from "zod";
import { getDb } from "../../_lib/db.js";
import { clientIp, fail, json, readJson } from "../../_lib/http.js";
import { verifyAgainstDummy, verifyPassword, withinBcryptLimit } from "../../_lib/password.js";
import { phoneSchema } from "../../_lib/phone.js";
import { adminFingerprint, sessionCookie, signSession } from "../../_lib/session.js";
import { clearFailures, lockRemainingMs, recordFailure } from "../../_lib/throttle.js";

const adminSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).refine(withinBcryptLimit),
  mode: z.literal("admin"),
});

const staffSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).refine(withinBcryptLimit),
  mode: z.literal("staff"),
});

const loginSchema = z.discriminatedUnion("mode", [adminSchema, staffSchema]);

const BAD_CREDENTIALS = "Nomor telepon atau password salah.";
const BAD_ADMIN = "Username atau password salah.";

function tooManyAttempts(lockMs: number): Response {
  const seconds = Math.ceil(lockMs / 1000);
  const minutes = Math.ceil(seconds / 60);
  return fail(429, `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`, { retryAfterSeconds: seconds });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJson(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  const now = Date.now();

  if (data.mode === "admin") {
    const { username, password } = data;
    const key = `login|${username.toLowerCase()}|${clientIp(request)}`;
    const remaining = await lockRemainingMs(key, now);
    if (remaining > 0) return tooManyAttempts(remaining);

    const adminUsername = process.env.ADMIN_USERNAME?.trim();
    const adminHash = process.env.ADMIN_PASSWORD_HASH?.trim();
    const isAdmin = adminUsername && adminHash && username.toLowerCase() === adminUsername.toLowerCase();
    const ok = isAdmin ? await verifyPassword(password, adminHash!) : (await verifyAgainstDummy(password), false);

    if (!ok) {
      const lockMs = await recordFailure(key, now);
      return lockMs > 0 ? tooManyAttempts(lockMs) : fail(401, BAD_ADMIN);
    }
    await clearFailures(key);
    const token = await signSession({ role: "admin", pv: adminFingerprint() });
    return json(
      { role: "admin", username: adminUsername, fullName: "Admin" },
      { headers: { "Set-Cookie": sessionCookie(token) } },
    );
  }

  // mode === "staff": login nomor telepon + Password Cadangan
  const { phone, password } = data;
  const key = `login|${phone}|${clientIp(request)}`;
  const remaining = await lockRemainingMs(key, now);
  if (remaining > 0) return tooManyAttempts(remaining);

  const result = await getDb().execute({
    sql: `SELECT id, full_name, display_name, email, status, session_epoch, password_hash
          FROM staff WHERE phone = ? AND status IN ('aktif', 'nonaktif')`,
    args: [phone],
  });
  const row = result.rows[0];
  if (!row || row.password_hash == null) {
    await verifyAgainstDummy(password);
    const lockMs = await recordFailure(key, now);
    return lockMs > 0 ? tooManyAttempts(lockMs) : fail(401, BAD_CREDENTIALS);
  }
  const ok = await verifyPassword(password, String(row.password_hash));
  if (!ok || String(row.status) !== "aktif") {
    const lockMs = await recordFailure(key, now);
    return lockMs > 0 ? tooManyAttempts(lockMs) : fail(401, BAD_CREDENTIALS);
  }
  await clearFailures(key);

  const token = await signSession({ role: "staff", staffId: Number(row.id), ep: Number(row.session_epoch) });
  const displayName =
    row.display_name == null || String(row.display_name).trim() === "" ? null : String(row.display_name);
  return json(
    { role: "staff", fullName: String(row.full_name), displayName, identifier: displayName ?? String(row.email) },
    { headers: { "Set-Cookie": sessionCookie(token) } },
  );
}
