import { z } from "zod";

/** Semua respons API tidak boleh di-cache, karena berisi data per pengguna. */
export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { status: init.status ?? 200, headers });
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, { status });
}

/**
 * IP klien. Di Vercel, header ini diisi oleh platform (bukan oleh klien),
 * jadi aman dipakai sebagai bagian kunci pembatasan login.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Pastikan objek request adalah Request standar yang punya headers.get dan url absolut.
 * Di Vercel, kadang request yang sampai punya headers sebagai string/plain object, atau url relatif.
 * Membungkusnya membuat semua consumer (authenticate, new URL(request.url), dst.) aman.
 */
export function ensureRequest(request: Request | unknown): Request {
  if (request instanceof Request) return request;
  // Fallback: bangun Request dari properti yang ada. Ini tidak akan terjadi di production
  // yang normal, tetapi melindungi dari edge case platform yang melewatkan objek bukan-Request.
  const url = (request as { url?: string }).url ?? "/";
  const method = ((request as { method?: string }).method ?? "GET").toUpperCase();
  const headers = (request as { headers?: Record<string, string> | string }).headers ?? {};
  const normalizedHeaders = new Headers(
    typeof headers === "string" ? headers.split("\r\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }) : Object.entries(headers as Record<string, string>),
  );
  const body = (request as { body?: string | null }).body ?? null;
  return new Request(
    url.startsWith("http") ? url : `https://x${url}`,
    { method, headers: normalizedHeaders, body: body ?? undefined },
  );
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Membaca body JSON dan memvalidasinya.
 * Wajib Content-Type JSON: form lintas situs tidak bisa mengirim tipe ini tanpa preflight,
 * jadi ini sekaligus lapisan tambahan terhadap CSRF di atas SameSite=Lax.
 */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    return { ok: false, response: fail(415, "Content-Type harus application/json.") };
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(400, "Permintaan tidak valid.") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Permintaan tidak valid.";
    return { ok: false, response: fail(400, message) };
  }
  return { ok: true, data: result.data };
}
