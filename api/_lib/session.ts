import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const COOKIE_NAME = "session";

/**
 * Isi token. `ep` (session_epoch) mengikat sesi Staff ke epoch di database; epoch dinaikkan untuk mencabut semua sesi Staff.
 * `pv` mengikat sesi Admin ke kredensial di env. Mengganti kredensial Admin mematikan sesi lama.
 */
export type Session =
  | { role: "admin"; pv: string }
  | { role: "staff"; staffId: number; ep: number };

/** Dipakai juga oleh cookie sementara alur Google (api/_lib/google.ts). */
export function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET belum diset atau kurang dari 32 karakter");
  }
  return new TextEncoder().encode(secret);
}

/** Sidik jari kredensial Admin dari env. Berubah jika username atau hash diganti. */
export function adminFingerprint(): string {
  const material = `${process.env.ADMIN_USERNAME ?? ""}:${process.env.ADMIN_PASSWORD_HASH ?? ""}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.role === "admin" && typeof payload.pv === "string") {
      return { role: "admin", pv: payload.pv };
    }
    if (payload.role === "staff" && typeof payload.staffId === "number" && typeof payload.ep === "number") {
      return { role: "staff", staffId: payload.staffId, ep: payload.ep };
    }
    return null;
  } catch {
    return null;
  }
}

/** Secure hanya di Vercel, supaya dev lokal lewat http tetap bisa login. */
function cookieFlags(): string {
  return `Path=/; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`;
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; ${cookieFlags()}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; ${cookieFlags()}; Max-Age=0`;
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}
