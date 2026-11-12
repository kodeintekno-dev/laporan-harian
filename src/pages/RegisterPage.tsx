import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

/**
 * Diisi sekali setelah login Google pertama. Identitas Google (sub, email, nama) sudah tersimpan di cookie
 * pendaftaran bertanda tangan, jadi form ini hanya menanyakan nama lengkap dan nomor telepon.
 * Hasilnya akun berstatus 'menunggu' sampai Admin menyetujui.
 */
export function RegisterPage({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await api.cancelRegistration();
      onCancel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Pendaftaran gagal dibatalkan.");
    } finally {
      setCancelling(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register(fullName.trim(), phone.trim());
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Lengkapi data</h1>
      <p className="muted">
        Akun Google Anda belum terdaftar. Isi nama lengkap dan nomor telepon, lalu tunggu persetujuan Admin.
      </p>
      <form onSubmit={submit}>
        <label>
          Nama lengkap
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
        </label>
        <label>
          Nomor telepon
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="08xx atau +628xx"
            required
            aria-describedby="phone-hint"
          />
          <small id="phone-hint" className="muted">
            Dipakai untuk masuk dengan Password Cadangan saat Google tidak tersedia.
          </small>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" disabled={busy || cancelling}>
            {busy ? "Mengirim…" : "Daftar"}
          </button>
          <button type="button" className="secondary" disabled={busy || cancelling} onClick={cancel}>
            {cancelling ? "Membatalkan…" : "Batal"}
          </button>
        </div>
      </form>
    </main>
  );
}
