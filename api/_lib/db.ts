import { createClient as createHttpClient, type Client } from "@libsql/client/http";
import { createClient as createLocalClient } from "@libsql/client";

let client: Client | undefined;

/**
 * Satu koneksi per instance fungsi. Satu-satunya tempat yang membaca kredensial Turso.
 *
 * URL remote (libsql:, https:, http:) pakai HTTP client — murni JS, tanpa native binary,
 * supaya bundle Serverless Function tetap kecil. URL lokal (file:, :memory:) pakai client
 * default yang mendukung SQLite lokal (dipakai test dan dev tanpa Turso).
 */
export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL belum diset");
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
    const isRemote = /^(libsql|https?):/.test(url);
    client = isRemote
      ? createHttpClient({ url, authToken })
      : createLocalClient({ url, authToken });
  }
  return client;
}

/** Pelanggaran UNIQUE/constraint SQLite, mis. username kembar atau laporan ganda. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  return String(e?.code ?? "").startsWith("SQLITE_CONSTRAINT") || String(e?.message ?? "").includes("UNIQUE");
}
