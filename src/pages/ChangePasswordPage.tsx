import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

export function ChangePasswordPage({
  hasExisting,
  onDone,
  onCancel,
}: {
  hasExisting: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(hasExisting ? current : null, next);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>{hasExisting ? "Ubah Password Cadangan" : "Buat Password Cadangan"}</h1>
      <p className="muted">
        Password Cadangan dipakai untuk masuk dengan nomor telepon bila Anda tidak bisa memakai Google.
      </p>
      <form onSubmit={submit}>
        {hasExisting && (
          <label>
            Password Cadangan saat ini
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}
        <label>
          Password baru
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="pw-hint"
          />
          <small id="pw-hint" className="muted">
            Minimal 8 karakter.
          </small>
        </label>
        <label>
          Ulangi password baru
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan password"}
          </button>
          {onCancel && (
            <button type="button" className="secondary" onClick={onCancel}>
              Batal
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
