import { createClient, type Client } from "@libsql/client/http";

let client: Client | undefined;

/** Satu koneksi per instance fungsi. Satu-satunya tempat yang membaca kredensial Turso. */
export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL belum diset");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

/** Pelanggaran UNIQUE/constraint SQLite, mis. username kembar atau laporan ganda. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  return String(e?.code ?? "").startsWith("SQLITE_CONSTRAINT") || String(e?.message ?? "").includes("UNIQUE");
}
