import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { secretKey } from "./session.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const CALLBACK_PATH = "/api/auth/google/callback";
const FLOW_COOKIE = "google_flow";
const FLOW_PATH = "/api/auth/google";
const FLOW_TTL_SECONDS = 10 * 60;

export type GoogleConfig = { clientId: string; clientSecret: string };

/** Null jika GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum diset. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Redirect URI harus persis sama dengan yang didaftarkan di Google Cloud Console.
 * Diturunkan dari request supaya localhost dan staff.kodein.sch.id sama-sama jalan tanpa env tambahan.
 * Host palsu tidak berbahaya: Google menolak redirect URI yang tidak terdaftar.
 */
export function redirectUri(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  return `${url.origin}${CALLBACK_PATH}`;
}

/** Rahasia sekali pakai untuk satu percobaan login Google. Disimpan di cookie bertanda tangan, bukan di database. */
export type Flow = { state: string; nonce: string; verifier: string };

const random = (bytes: number): string => randomBytes(bytes).toString("base64url");

export function newFlow(): Flow {
  return { state: random(24), nonce: random(24), verifier: random(48) };
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function signFlow(flow: Flow): Promise<string> {
  return new SignJWT({ purpose: "google-flow", ...flow })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyFlow(token: string): Promise<Flow | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (
      payload.purpose !== "google-flow" ||
      typeof payload.state !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.verifier !== "string"
    ) {
      return null;
    }
    return { state: payload.state, nonce: payload.nonce, verifier: payload.verifier };
  } catch {
    return null;
  }
}

/** SameSite=Lax wajib: Google mengembalikan pengguna lewat navigasi lintas situs. Dibatasi ke path alur Google saja. */
function flowFlags(): string {
  return `Path=${FLOW_PATH}; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`;
}

export function flowCookie(token: string): string {
  return `${FLOW_COOKIE}=${token}; ${flowFlags()}; Max-Age=${FLOW_TTL_SECONDS}`;
}

export function clearedFlowCookie(): string {
  return `${FLOW_COOKIE}=; ${flowFlags()}; Max-Age=0`;
}

export function readFlowToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === FLOW_COOKIE) return rest.join("=") || null;
  }
  return null;
}

const REG_COOKIE = "google_reg";
const REG_PATH = "/api/auth";
const REG_TTL_SECONDS = 30 * 60;

/**
 * Akun Google yang sudah terverifikasi tetapi belum punya baris Staff. Cookie ini hanya cukup untuk
 * mengirim formulir pendaftaran (nama lengkap dan nomor telepon), bukan untuk mengakses data apa pun.
 */
export async function signRegistration(profile: GoogleProfile): Promise<string> {
  return new SignJWT({ purpose: "google-reg", sub: profile.sub, email: profile.email, name: profile.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REG_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyRegistration(token: string): Promise<GoogleProfile | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.purpose !== "google-reg" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" && payload.name ? payload.name : null,
    };
  } catch {
    return null;
  }
}

function regFlags(): string {
  return `Path=${REG_PATH}; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`;
}

export function registrationCookie(token: string): string {
  return `${REG_COOKIE}=${token}; ${regFlags()}; Max-Age=${REG_TTL_SECONDS}`;
}

export function clearedRegistrationCookie(): string {
  return `${REG_COOKIE}=; ${regFlags()}; Max-Age=0`;
}

export function readRegistrationToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REG_COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function authorizationUrl(config: GoogleConfig, request: Request, flow: Flow): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: codeChallenge(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Menukar authorization code dengan ID token. Melempar galat jika Google menolak. */
export async function exchangeCode(
  config: GoogleConfig,
  request: Request,
  code: string,
  verifier: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`Google menolak penukaran code (${response.status})`);
  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string" || !body.id_token) throw new Error("Respons Google tidak berisi id_token");
  return body.id_token;
}

export type GoogleProfile = { sub: string; email: string; name: string | null };

let remoteKeys: JWTVerifyGetKey | undefined;

function defaultKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(new URL(JWKS_URL));
  return remoteKeys;
}

/**
 * Memverifikasi tanda tangan, issuer, audience, kedaluwarsa, nonce, dan email_verified.
 * Mengembalikan null untuk token apa pun yang tidak lolos. `keys` bisa diganti di tes.
 */
export async function verifyIdToken(
  idToken: string,
  config: GoogleConfig,
  nonce: string,
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<GoogleProfile | null> {
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: ISSUERS,
      audience: config.clientId,
    });
    if (payload.nonce !== nonce) return null;
    if (payload.email_verified !== true && payload.email_verified !== "true") return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
    return { sub: payload.sub, email: payload.email.toLowerCase(), name };
  } catch {
    return null;
  }
}
