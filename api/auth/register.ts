import { z } from "zod";
import { getDb, isUniqueViolation } from "../_lib/db.js";
import { clearedRegistrationCookie, readRegistrationToken, verifyRegistration } from "../_lib/google.js";
import { fail, json, readJson } from "../_lib/http.js";
import { phoneSchema } from "../_lib/phone.js";
import { sessionCookie, signSession } from "../_lib/session.js";
import { fullNameSchema } from "../_lib/staff.js";

const DISPLAY_NAME_MAX = 60;

const schema = z.object({ fullName: fullNameSchema, phone: phoneSchema });

/**
 * Pendaftaran Staff setelah login Google pertama. Identitas (sub, email, name) hanya diambil dari cookie
 * pendaftaran bertanda tangan yang diterbitkan callback Google, tidak pernah dari body permintaan.
 * Hasilnya baris staff berstatus 'menunggu' (Pendaftar) sampai Admin menyetujui.
 */
export async function POST(request: Request): Promise<Response> {
  const token = readRegistrationToken(request);
  const profile = token ? await verifyRegistration(token) : null;
  if (!profile) return fail(401, "Sesi pendaftaran habis. Silakan masuk dengan Google lagi.");

  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;
  const { fullName, phone } = parsed.data;

  const displayName = profile.name ? profile.name.slice(0, DISPLAY_NAME_MAX) : null;
  const db = getDb();
  let id: number;
  try {
    const result = await db.execute({
      sql: `INSERT INTO staff (google_sub, email, full_name, display_name, phone, status, session_epoch, created_at)
            VALUES (?, ?, ?, ?, ?, 'menunggu', 0, ?) RETURNING id`,
      args: [profile.sub, profile.email, fullName, displayName, phone, Date.now()],
    });
    id = Number(result.rows[0].id);
  } catch (error) {
    if (isUniqueViolation(error)) return fail(409, "Akun Google ini sudah terdaftar. Silakan masuk dengan Google.");
    throw error;
  }

  const session = await signSession({ role: "staff", staffId: id, ep: 0 });
  const response = json({ ok: true, status: "menunggu" }, { status: 201 });
  response.headers.append("Set-Cookie", sessionCookie(session));
  response.headers.append("Set-Cookie", clearedRegistrationCookie());
  return response;
}
