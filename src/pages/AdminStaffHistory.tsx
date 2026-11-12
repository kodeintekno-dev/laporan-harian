import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminHistoryItem } from "../api";
import { ReportView } from "../components/ReportView";
import { formatDate } from "../format";

export function AdminStaffHistory({
  staffId,
  fullName,
  onBack,
  onLogout,
}: {
  staffId: number;
  fullName: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<AdminHistoryItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      setError(null);
      try {
        const page = await api.adminHistory(staffId, before);
        setItems((prev) => (before ? [...prev, ...page.items] : page.items));
        setNext(page.nextBefore);
        setLoaded(true);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onLogout();
        else setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
      } finally {
        setBusy(false);
      }
    },
    [staffId, onLogout],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="admin-history-title">
      <button type="button" className="secondary" onClick={onBack}>
        Kembali ke rekap
      </button>
      <h2 id="admin-history-title">Riwayat {fullName}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loaded && items.length === 0 && <p className="muted">Belum ada riwayat.</p>}
      {items.map((item) => (
        <details key={item.date} className="history-item">
          <summary>
            {formatDate(item.date)}
            <span className="muted">
              {item.absence && ` · Tidak Hadir (${item.absence.category})`}
              {item.report?.status === "dibatalkan" && " · Laporan dibatalkan"}
              {item.report?.status === "aktif" && ` · ${item.report.tasks.length} tugas`}
            </span>
          </summary>
          {item.absence?.note && <p className="muted">Catatan Admin: {item.absence.note}</p>}
          {item.report && (
            <div className={item.report.status === "dibatalkan" ? "cancelled" : undefined}>
              <ReportView report={item.report} />
            </div>
          )}
          {!item.report && !item.absence && <p className="muted">Tidak ada data.</p>}
        </details>
      ))}
      {next && (
        <button type="button" className="secondary" onClick={() => load(next)} disabled={busy}>
          {busy ? "Memuat…" : "Muat lebih lama"}
        </button>
      )}
    </section>
  );
}
