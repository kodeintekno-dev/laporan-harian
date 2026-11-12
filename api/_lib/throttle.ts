import { getDb } from "./db.js";

/** Kegagalan ke-5 menutup 1 menit, lalu 2, 4, 8, ... sampai maksimal 60 menit. */
const LOCK_STARTS_AT = 5;
const MAX_LOCK_MINUTES = 60;
/** Hitungan kembali ke nol jika kegagalan terakhir sudah lebih dari 24 jam lalu. */
export const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

export function lockDurationMs(failCount: number): number {
  if (failCount < LOCK_STARTS_AT) return 0;
  const minutes = Math.min(2 ** (failCount - LOCK_STARTS_AT), MAX_LOCK_MINUTES);
  return minutes * 60_000;
}

/** Sisa waktu kunci dalam milidetik (0 jika tidak terkunci). */
export async function lockRemainingMs(key: string, now: number): Promise<number> {
  const result = await getDb().execute({
    sql: "SELECT locked_until FROM login_attempt WHERE key = ?",
    args: [key],
  });
  const lockedUntil = Number(result.rows[0]?.locked_until ?? 0);
  return Math.max(0, lockedUntil - now);
}

/** Mencatat satu kegagalan. Mengembalikan lama kunci (ms) yang berlaku sekarang, 0 jika belum terkunci. */
export async function recordFailure(key: string, now: number): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO login_attempt (key, fail_count, locked_until, last_fail_at)
          VALUES (?, 1, 0, ?)
          ON CONFLICT(key) DO UPDATE SET
            fail_count = CASE WHEN ? - last_fail_at > ? THEN 1 ELSE fail_count + 1 END,
            last_fail_at = ?
          RETURNING fail_count`,
    args: [key, now, now, RESET_AFTER_MS, now],
  });
  const lockMs = lockDurationMs(Number(result.rows[0]?.fail_count ?? 1));
  if (lockMs > 0) {
    await db.execute({
      sql: "UPDATE login_attempt SET locked_until = ? WHERE key = ?",
      args: [now + lockMs, key],
    });
  }
  // Kunci mencakup username yang diketik penyerang, jadi baris lama dibersihkan agar tabel tidak membengkak.
  await db.execute({
    sql: "DELETE FROM login_attempt WHERE last_fail_at < ? AND locked_until < ?",
    args: [now - RESET_AFTER_MS, now],
  });
  return lockMs;
}

export async function clearFailures(key: string): Promise<void> {
  await getDb().execute({ sql: "DELETE FROM login_attempt WHERE key = ?", args: [key] });
}
