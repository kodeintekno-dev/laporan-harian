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
