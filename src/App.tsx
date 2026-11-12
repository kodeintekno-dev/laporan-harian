import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me } from "./api";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { AdminHome } from "./pages/AdminHome";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StaffHome } from "./pages/StaffHome";

type State = { status: "loading" } | { status: "anonymous" } | { status: "ready"; me: Me };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState({ status: "ready", me: await api.me() });
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ status: "anonymous" });
      else {
        setLoadError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
        setState({ status: "anonymous" });
      }
    }
  }, []);

  useEffect(() => {
    // Baca query string dari Google OAuth callback (?daftar=1 atau ?galat=...)
    const params = new URLSearchParams(window.location.search);
    const galat = params.get("galat");
    if (galat) {
      const pesan: Record<string, string> = {
        google_belum_diset: "Login Google belum dikonfigurasi. Hubungi Admin.",
        akun_nonaktif: "Akun Anda telah dinonaktifkan. Hubungi Admin.",
        state_tidak_valid: "Sesi login Google tidak valid. Coba lagi.",
        token_tidak_valid: "Verifikasi akun Google gagal. Coba lagi.",
      };
      setLoadError(pesan[galat] ?? `Terjadi kesalahan: ${galat}`);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("daftar")) {
      setRegistering(true);
      window.history.replaceState({}, "", "/");
    }
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setChangingPassword(false);
    setRegistering(false);
    setState({ status: "anonymous" });
  }, []);

  if (state.status === "loading") {
    return (
      <main className="card" aria-busy="true">
        <p className="muted">Memuat…</p>
      </main>
    );
  }

  if (state.status === "anonymous") {
    if (registering) {
      return (
        <RegisterPage
          onDone={() => {
            setRegistering(false);
            void refresh();
          }}
        />
      );
    }
    return (
      <>
        {loadError && (
          <p role="alert" className="error banner">
            {loadError}
          </p>
        )}
        <LoginPage onLoggedIn={(me) => setState({ status: "ready", me })} />
      </>
    );
  }

  const { me } = state;

  if (me.role === "staff" && changingPassword) {
    return (
      <ChangePasswordPage
        hasExisting={me.hasBackupPassword}
        onDone={() => {
          setChangingPassword(false);
          void refresh();
        }}
        onCancel={() => setChangingPassword(false)}
      />
    );
  }

  if (me.role === "staff") {
    return (
      <StaffHome
        me={me}
        onChangePassword={() => setChangingPassword(true)}
        onLogout={logout}
      />
    );
  }

  return <AdminHome onLogout={logout} />;
}
