import { useEffect, useState } from "react";
import { api, ApiError, type AbsenceMark, type Report } from "../api";
import { ReportView } from "../components/ReportView";
import { formatDate } from "../format";

type Entry = { date: string; report?: Report; absence?: AbsenceMark };

/** Gabungkan laporan dan tanda Tidak Hadir per tanggal, terbaru dulu. */
function merge(reports: Report[], absences: AbsenceMark[]): Entry[] {
  const byDate = new Map<string, Entry>();
  for (const report of reports) byDate.set(report.reportDate, { date: report.reportDate, report });
  for (const absence of absences) byDate.set(absence.date, { ...byDate.get(absence.date), date: absence.date, absence });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function HistoryList() {
  const [items, setItems] = useState<Report[]>([]);
  const [absences, setAbsences] = useState<AbsenceMark[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(before?: string) {
    setBusy(true);
    setError(null);
    try {
      const page = await api.history(before);
      setItems((prev) => (before ? [...prev, ...page.items] : page.items));
      setAbsences((prev) => (before ? [...prev, ...page.absences] : page.absences));
      setNext(page.nextBefore);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const entries = merge(items, absences);

  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title">Riwayat laporan</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loaded && entries.length === 0 && <p className="muted">Belum ada laporan.</p>}
      {entries.map((entry) =>
        entry.absence ? (
          <div key={entry.date} className="history-item">
            <strong>{formatDate(entry.date)}</strong>
            <span className="muted"> · Tidak Hadir ({entry.absence.category})</span>
          </div>
        ) : (
          <details key={entry.date} className="history-item">
            <summary>
              {formatDate(entry.date)}
              <span className="muted"> · {entry.report!.tasks.length} tugas</span>
            </summary>
            <ReportView report={entry.report!} />
          </details>
        ),
      )}
      {next && (
        <button type="button" className="secondary" onClick={() => load(next)} disabled={busy}>
          {busy ? "Memuat…" : "Muat lebih lama"}
        </button>
      )}
    </section>
  );
}
