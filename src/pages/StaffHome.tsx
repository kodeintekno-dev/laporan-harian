import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me, type Today } from "../api";
import { ReportView } from "../components/ReportView";
import { formatDate } from "../format";
import { HistoryList } from "./HistoryList";
import { ReportForm } from "./ReportForm";

export function StaffHome({
  me,
  onChangePassword,
  onLogout,
}: {
  me: Extract<Me, { role: "staff" }>;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setToday(await api.today());
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        onLogout();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reload() {
    await load();
    setHistoryKey((k) => k + 1);
  }

  return (
    <main className="card wide">
      <header className="top">
        <div>
          <h1>Halo, {me.identifier}</h1>
          {today && <p className="muted">{formatDate(today.date)}</p>}
        </div>
        <div className="row tight">
          <button type="button" className="secondary" onClick={onChangePassword}>
            {me.hasBackupPassword ? "Ubah Password Cadangan" : "Buat Password Cadangan"}
          </button>
          <button type="button" className="secondary" onClick={onLogout}>
            Keluar
          </button>
        </div>
      </header>

      {me.status === "menunggu" && (
        <p className="notice">
          Akun Anda menunggu persetujuan Admin. Anda bisa melihat halaman ini, tetapi belum bisa mengirim laporan.
        </p>
      )}
      {me.status === "ditolak" && (
        <p className="notice">Akun Anda ditolak Admin. Hubungi Admin untuk informasi lebih lanjut.</p>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!today && !error && <p className="muted">Memuat…</p>}

      {today?.absence && (
        <p className="notice">Hari ini Anda ditandai Tidak Hadir ({today.absence.category}). Tidak perlu mengirim laporan.</p>
      )}
      {today?.cancelled && (
        <p className="notice">Laporan hari ini dibatalkan Admin dan tidak bisa dikirim ulang. Hubungi Admin.</p>
      )}
      {today?.report && (
        <section aria-labelledby="sent-title">
          <h2 id="sent-title">Laporan hari ini sudah terkirim</h2>
          <ReportView report={today.report} />
        </section>
      )}
      {today && !today.report && !today.absence && !today.cancelled && (
        <section aria-labelledby="form-title">
          <h2 id="form-title">Laporan hari ini</h2>
          {today.isWeekend && (
            <p className="notice">Hari ini akhir pekan. Mengirim laporan akan tercatat sebagai piket.</p>
          )}
          <ReportForm onSubmitted={() => void reload()} onConflict={() => void reload()} />
        </section>
      )}

      <HistoryList key={historyKey} />
    </main>
  );
}
