import { z } from "zod";

/**
 * Menormalkan nomor telepon Indonesia ke format +62... supaya 0812..., 62812..., dan +62 812-... dianggap sama.
 * Hanya nomor seluler (diawali 8) yang diterima. Mengembalikan null jika bentuknya tidak valid.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  let digits: string;
  if (compact.startsWith("+62")) digits = compact.slice(3);
  else if (compact.startsWith("62")) digits = compact.slice(2);
  else if (compact.startsWith("0")) digits = compact.slice(1);
  else return null;

  // Setelah kode negara: 8 diikuti 8 sampai 11 angka (nomor seluler 10 sampai 13 digit).
  if (!/^8\d{8,11}$/.test(digits)) return null;
  return `+62${digits}`;
}

export const phoneSchema = z
  .string("Nomor telepon wajib diisi.")
  .trim()
  .min(1, "Nomor telepon wajib diisi.")
  .max(32, "Nomor telepon terlalu panjang.")
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Nomor telepon tidak valid. Contoh: 081234567890." });
      return z.NEVER;
    }
    return normalized;
  });
