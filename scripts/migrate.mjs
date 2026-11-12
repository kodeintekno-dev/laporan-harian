// Menjalankan file db/migrations/*.sql berurutan, sekali saja per file.
import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL belum diset (lihat .env.example).");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
const dir = join(import.meta.dirname, "..", "db", "migrations");

await db.execute(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
);
const done = new Set(
  (await db.execute("SELECT name FROM schema_migrations")).rows.map((r) => String(r.name)),
);

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  if (done.has(file)) continue;
  const sql = await readFile(join(dir, file), "utf8");
  await db.executeMultiple(sql);
  await db.execute({
    sql: "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
    args: [file, Date.now()],
  });
  console.log(`Diterapkan: ${file}`);
}
console.log("Migrasi selesai.");
db.close();
