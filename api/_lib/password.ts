import bcrypt from "bcryptjs";
import { z } from "zod";

const COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Hash yang rusak atau salah format dianggap tidak cocok, bukan error. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

let dummyHash: string | undefined;

/**
 * Dipanggil saat username tidak ada, agar waktu respons tidak membedakan
 * "username tidak ada" dari "password salah".
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("dummy-password-untuk-menyamakan-waktu", COST);
  await verifyPassword(password, dummyHash);
}

/** bcrypt hanya membaca 72 byte pertama, jadi lebih dari itu ditolak supaya tidak menyesatkan. */
const MAX_BYTES = 72;
export const withinBcryptLimit = (value: string): boolean => Buffer.byteLength(value, "utf8") <= MAX_BYTES;

export const newPasswordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter.")
  .refine(withinBcryptLimit, "Password terlalu panjang (maksimal 72 byte).");
