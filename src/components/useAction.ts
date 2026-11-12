import { useState } from "react";
import { ApiError } from "../api";

/**
 * Menjalankan aksi async dengan status sibuk dan pesan galat lokal.
 * Galat 401 dan galat non-API diteruskan ke `onError` (mis. keluar dari sesi).
 * Mengembalikan true bila aksi berhasil.
 */
export function useAction(onError: (e: unknown) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status !== 401) setError(e.message);
      else onError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}
