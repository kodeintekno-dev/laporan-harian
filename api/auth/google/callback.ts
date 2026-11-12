import { getDb } from "../../_lib/db.js";
import {
  clearedFlowCookie,
  exchangeCode,
  googleConfig,
  readFlowToken,
  registrationCookie,
  signRegistration,
  verifyFlow,
  verifyIdToken,
} from "../../_lib/google.js";
import { sessionCookie, signSession } from "../../_lib/session.js";

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** Semua kegagalan kembali ke halaman login dengan kode galat umum, tanpa membocorkan penyebab teknis. */
function back(code: string): Response {
  return redirect(`/?galat=${code}`, [clearedFlowCookie()]);
}

/**
 * Google mengembalikan pengguna ke sini. Urutannya: cek state dari cookie alur, tukar code (PKCE),
 * verifikasi ID token (tanda tangan, issuer, audience, nonce, email_verified), lalu cocokkan `sub` ke tabel staff.
 * - sub dikenal: terbitkan sesi (Pendaftar juga dapat sesi, tetapi hanya untuk melihat statusnya).
 * - sub belum dikenal: terbitkan cookie pendaftaran, pengguna mengisi nama lengkap dan nomor telepon.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back("google_dibatalkan");

  const config = googleConfig();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const flowToken = readFlowToken(request);
  const flow = flowToken ? await verifyFlow(flowToken) : null;
  if (!config || !code || !state || !flow || state !== flow.state) return back("google_gagal");

  let profile;
  try {
    const idToken = await exchangeCode(config, request, code, flow.verifier);
    profile = await verifyIdToken(idToken, config, flow.nonce);
  } catch {
    return back("google_gagal");
  }
  if (!profile) return back("google_gagal");

  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, status, session_epoch FROM staff WHERE google_sub = ?",
    args: [profile.sub],
  });
  const row = result.rows[0];

  if (!row) {
    return redirect("/?daftar=1", [clearedFlowCookie(), registrationCookie(await signRegistration(profile))]);
  }

  // Akun nonaktif ditolak sebelum sesi diterbitkan.
  if (String(row.status) === "nonaktif") return back("akun_nonaktif");

  await db.execute({ sql: "UPDATE staff SET email = ? WHERE id = ?", args: [profile.email, Number(row.id)] });
  const token = await signSession({ role: "staff", staffId: Number(row.id), ep: Number(row.session_epoch) });
  return redirect("/", [clearedFlowCookie(), sessionCookie(token)]);
}
