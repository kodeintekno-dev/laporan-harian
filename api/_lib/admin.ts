import type { InStatement } from "@libsql/client";
import { z } from "zod";
import { MAX_NOTE_LENGTH } from "../../shared/report-limits.js";
import { addDays } from "./time.js";

export const ABSENCE_CATEGORIES = ["Sakit", "Izin", "Cuti", "Tanpa Keterangan"] as const;
export type AbsenceCategory = (typeof ABSENCE_CATEGORIES)[number];

/** Jendela tanggal untuk menandai Tidak Hadir: 31 hari ke belakang dan 100 hari ke depan dari hari ini (WIB). */
export const ABSENCE_PAST_DAYS = 31;
export const ABSENCE_FUTURE_DAYS = 100;

export function absenceWindow(today: string): { min: string; max: string } {
  return { min: addDays(today, -ABSENCE_PAST_DAYS), max: addDays(today, ABSENCE_FUTURE_DAYS) };
}

/** Tanggal kalender 'YYYY-MM-DD' yang benar-benar ada (menolak 2026-02-30 dan sejenisnya). */
export const dateSchema = z
  .string("Tanggal wajib diisi.")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  // Regex diperiksa lagi di sini karena zod tetap menjalankan refine setelah regex gagal; addDays tidak boleh melihat NaN.
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value, "Tanggal tidak valid.");

export const staffIdSchema = z.number("staffId tidak valid.").int("staffId tidak valid.").positive("staffId tidak valid.");

/** Alasan wajib untuk setiap koreksi, dicatat di Log Koreksi. */
export const reasonSchema = z
  .string("Alasan wajib diisi.")
  .trim()
  .min(1, "Alasan wajib diisi.")
  .max(MAX_NOTE_LENGTH, `Alasan maksimal ${MAX_NOTE_LENGTH} karakter.`);

/** Membaca parameter query bertipe tanggal. Mengembalikan pesan galat jika formatnya salah. */
export function readQueryDate(url: URL, name: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const raw = url.searchParams.get(name);
  if (raw === null) return { ok: true, value: null };
  const parsed = dateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: `Parameter ${name}: ${parsed.error.issues[0]?.message ?? "tidak valid."}` };
  return { ok: true, value: parsed.data };
}

export type LogEntry = {
  type: "laporan" | "tidak_hadir";
  staffId: number;
  date: string;
  action: string;
  reason: string;
  before: unknown;
  after: unknown;
  now: number;
};

/**
 * Baris Log Koreksi yang hanya tertulis bila pernyataan tepat sebelumnya benar-benar mengubah baris.
 * Dipakai di dalam db.batch() persis setelah INSERT/UPDATE/DELETE yang dicatat.
 */
export function logIfChanged(entry: LogEntry): InStatement {
  return {
    sql: `INSERT INTO correction_log (target_type, staff_id, target_date, action, reason, before_json, after_json, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`,
    args: [
      entry.type,
      entry.staffId,
      entry.date,
      entry.action,
      entry.reason,
      entry.before === null ? null : JSON.stringify(entry.before),
      entry.after === null ? null : JSON.stringify(entry.after),
      entry.now,
    ],
  };
}
