import { useState, type FormEvent } from "react";
import { api, ApiError, type Me } from "../api";

type Mode = "pilih" | "staff" | "admin";

export function LoginPage({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<Mode>("pilih");

  if (mode === "staff") {
    return <StaffLoginForm onLoggedIn={onLoggedIn} onBack={() => setMode("pilih")} />;
  }
  if (mode === "admin") {
    return <AdminLoginForm onLoggedIn={onLoggedIn} onBack={() => setMode("pilih")} />;
  }

  return (
    <main className="card">
      <h1>Masuk ke akun Anda</h1>
      <p className="muted">Masuk untuk mengirim laporan kerja harian.</p>
      <div className="login-options">
        <a href="/api/auth/google" className="button google-button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.81 7.18l7.73 6C44.36 38.03 46.98 31.87 46.98 24.55Z" />
            <path fill="#FBBC05" d="M10.53 28.59C10.05 27.14 9.78 25.6 9.78 24s.27-3.14.76-4.59l-7.98-6.19A24.06 24.06 0 0 0 0 24c0 3.88.93 7.55 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6C30.03 37.66 27.27 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          Masuk dengan Google
        </a>
        <p className="divider">atau</p>
        <button type="button" className="secondary" onClick={() => setMode("staff")}>
          Masuk dengan nomor telepon
        </button>
        <button type="button" className="secondary small" onClick={() => setMode("admin")}>
          Login Admin
        </button>
      </div>
    </main>
  );
}

function StaffLoginForm({ onLoggedIn, onBack }: { onLoggedIn: (me: Me) => void; onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await api.loginStaff(phone.trim(), password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Masuk dengan nomor telepon</h1>
      <p className="muted">Gunakan Password Cadangan yang sudah Anda buat sebelumnya.</p>
      <form onSubmit={submit}>
        <label>
          Nomor telepon
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="08xx atau +628xx"
            required
          />
        </label>
        <label>
          Password Cadangan
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
          <button type="button" className="secondary" onClick={onBack}>
            Kembali
          </button>
        </div>
      </form>
    </main>
  );
}

function AdminLoginForm({ onLoggedIn, onBack }: { onLoggedIn: (me: Me) => void; onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await api.loginAdmin(username.trim(), password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Login Admin</h1>
      <form onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
          <button type="button" className="secondary" onClick={onBack}>
            Kembali
          </button>
        </div>
      </form>
    </main>
  );
}
