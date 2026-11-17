import type { Row } from "@libsql/client";
import { z } from "zod";
import { MUSYRIF } from "../../shared/jabatan.js";
import { reportSchedule } from "./report-schedule.js";
import { addDays } from "./time.js";

export const JABATAN_LIST = [
  "Kepala Sekolah",
  "Wakil Kepala Sekolah",
  "Admin Keuangan",
  "Sekben Umum",
  "Kabid Diknas",
  "Kabid IT",
  "Kabid Kesiswaan",
  "Kabid Sarpras",
  "Tim Diknas (Mentor)",
  "Tim IT",
  MUSYRIF,
  "Tim Sarpras",
  "Branding & Marketing",
  "Resto & Mart",
] as const;

export type Jabatan = (typeof JABATAN_LIST)[number];

export const MAX_JABATAN = 3;

export type StaffView = {
  id: number;
  email: string;
  fullName: string;
  displayName: string | null;
  identifier: string;
  phone: string;
  status: "menunggu" | "aktif" | "ditolak" | "nonaktif";
  jabatan: Jabatan[];
  isAdmin: boolean;
  monitoringOnly: boolean;
  hasGoogleLinked: boolean;
  hasBackupPassword: boolean;
  createdAt: number;
  decidedAt: number | null;
};

export const STAFF_COLUMNS =
  "id, email, full_name, display_name, phone, status, google_sub, password_hash, created_at, decided_at, is_admin, monitoring_only";

export function toStaffView(row: Row, jabatan: Jabatan[] = []): StaffView {
  const displayName =
    row.display_name == null || String(row.display_name).trim() === "" ? null : String(row.display_name);
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    displayName,
    identifier: displayName ?? String(row.email),
    phone: String(row.phone),
    status: String(row.status) as StaffView["status"],
    jabatan,
    isAdmin: Number(row.is_admin) === 1,
    monitoringOnly: Number(row.monitoring_only) === 1,
    hasGoogleLinked: row.google_sub != null,
    hasBackupPassword: row.password_hash != null,
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at == null ? null : Number(row.decided_at),
  };
}

/** Ambil jabatan untuk satu atau banyak staff_id sekaligus. Kembalikan Map<staffId, Jabatan[]>. */
export async function fetchJabatan(
  db: import("@libsql/client").Client,
  staffIds: number[],
): Promise<Map<number, Jabatan[]>> {
  const map = new Map<number, Jabatan[]>();
  if (staffIds.length === 0) return map;
  const placeholders = staffIds.map(() => "?").join(",");
  const rows = (
    await db.execute({
      sql: `SELECT sj.staff_id, j.nama
            FROM staff_jabatan sj JOIN jabatan j ON j.id = sj.jabatan_id
            WHERE sj.staff_id IN (${placeholders})
            ORDER BY j.id`,
      args: staffIds,
    })
  ).rows;
  for (const r of rows) {
    const sid = Number(r.staff_id);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push(String(r.nama) as Jabatan);
  }
  return map;
}

/** Ganti jabatan satu Staff (dalam transaksi batch). Maks MAX_JABATAN. */
export async function setJabatan(
  db: import("@libsql/client").Client,
  staffId: number,
  jabatanNama: string[],
  permission = "1",
): Promise<{ error: string } | null> {
  const valid = jabatanNama.filter((n): n is Jabatan => (JABATAN_LIST as readonly string[]).includes(n));
  if (valid.length !== jabatanNama.length) return { error: "Jabatan tidak valid." };
  if (valid.length > MAX_JABATAN) return { error: `Maksimal ${MAX_JABATAN} jabatan per Staff.` };

  if (valid.includes(MUSYRIF) && valid.length !== 1) return { error: "Jabatan Musyrif tidak bisa dirangkap." };
  if (new Set(valid).size !== valid.length) return { error: "Jabatan tidak boleh duplikat." };
  const { date } = await reportSchedule(db, staffId, Date.now());
  const effectiveDate = addDays(date, 1);
  const placeholders = valid.map(() => "?").join(",");
  const jRows = valid.length === 0 ? [] : (
    await db.execute({ sql: `SELECT id, nama FROM jabatan WHERE nama IN (${placeholders})`, args: valid })
  ).rows;
  const idMap = new Map(jRows.map((r) => [String(r.nama), Number(r.id)]));

  await db.batch(
    [
      { sql: `DELETE FROM staff_jabatan WHERE staff_id = ? AND ${permission}`, args: [staffId] },
      ...valid.map((nama) => ({
        sql: `INSERT INTO staff_jabatan (staff_id, jabatan_id) SELECT ?, ? WHERE ${permission}`,
        args: [staffId, idMap.get(nama)!],
      })),
      {
        sql: `INSERT INTO report_schedule (staff_id, effective_date, musyrif)
              SELECT ?, ?, ? WHERE ${permission}
              ON CONFLICT (staff_id, effective_date) DO UPDATE SET musyrif = excluded.musyrif`,
        args: [staffId, effectiveDate, Number(valid.includes(MUSYRIF))],
      },
    ],
    "write",
  );
  return null;
}

export const fullNameSchema = z
  .string("Nama lengkap wajib diisi.")
  .trim()
  .min(1, "Nama lengkap wajib diisi.")
  .max(100, "Nama lengkap maksimal 100 karakter.");

export const displayNameSchema = z
  .string()
  .trim()
  .max(60, "Display Name maksimal 60 karakter.")
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v == null || v === "" ? null : v));

/** Hapus kunci login nomor telepon milik Staff. */
export function throttleKeyPatterns(phone: string, staffId: number): { exact: string[]; likeLogin: string } {
  const escaped = phone.replace(/[\\%_]/g, (c) => `\\${c}`);
  return { exact: [`chgpw|${staffId}`], likeLogin: `login|${escaped}|%` };
}
