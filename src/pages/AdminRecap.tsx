import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Recap, type RecapRow, type RecapStatus } from "../api";
import { MarkAbsenceForm, Panel, ReasonForm, SaveReportForm } from "../components/AdminForms";
import { ReportView } from "../components/ReportView";
import { useAction } from "../components/useAction";
import { formatDate } from "../format";
import { AdminStaffHistory } from "./AdminStaffHistory";

const STATUS_LABEL: Record<RecapStatus, string> = {
  terkirim: "Terkirim",
  diisi_admin: "Diisi Admin",
  tidak_hadir: "Tidak Hadir",
  belum_mengirim: "Belum Mengirim",
};

type Open = { kind: "mark" | "revoke" | "save" | "cancel"; staffId: number };

export function AdminRecap({ onLogout }: { onLogout: () => void }) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [history, setHistory] = useState<{ staffId: number; fullName: string } | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        onLogout();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
    },
    [onLogout],
  );

  const load = useCallback(
    async (date?: string) => {
      setError(null);
      try {
        const data = await api.recap(date);
        setRecap(data);
        // Rentang ekspor mengikuti tanggal rekap pertama kali, setelah itu dibiarkan sesuai pilihan Admin.
        setExportFrom((prev) => prev || data.date);
        setExportTo((prev) => prev || data.date);
      } catch (e) {
        handle(e);
      }
    },
    [handle],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const exportAction = useAction(handle);

  function done(message: string) {
    setOpen(null);
    setNotice(message);
    void load(recap?.date);
  }

  if (history) {
    return (
      <AdminStaffHistory
        staffId={history.staffId}
        fullName={history.fullName}
        onBack={() => setHistory(null)}
        onLogout={onLogout}
      />
    );
  }

  return (
    <section aria-labelledby="recap-title">
      <h2 id="recap-title">Rekap harian</h2>
      <label className="inline">
        Tanggal
        <input
          type="date"
          value={recap?.date ?? ""}
          onChange={(e) => {
            if (!e.target.value) return;
            setOpen(null);
            setNotice(null);
            void load(e.target.value);
          }}
        />
      </label>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice-line">
          {notice}
        </p>
      )}

      {!recap && !error && <p className="muted">Memuat…</p>}
      {recap && (
        <>
          <p className="muted">{formatDate(recap.date)}</p>
          <dl className="summary">
            <div><dt>Terkirim</dt><dd>{recap.summary.terkirim}</dd></div>
            <div><dt>Diisi Admin</dt><dd>{recap.summary.diisiAdmin}</dd></div>
            <div><dt>Tidak Hadir</dt><dd>{recap.summary.tidakHadir}</dd></div>
            <div><dt>Belum Mengirim</dt><dd>{recap.summary.belumMengirim}</dd></div>
          </dl>
          {recap.isWeekend && (
            <p className="muted">Akhir pekan: hanya Staff yang melapor atau ditandai Tidak Hadir yang tampil.</p>
          )}
          {recap.rows.length === 0 && <p className="muted">Tidak ada Staff untuk ditampilkan pada tanggal ini.</p>}
          <ul className="staff-list recap-list">
            {recap.rows.map((row) => (
              <RecapItem
                key={row.staffId}
                row={row}
                date={recap.date}
                open={open?.staffId === row.staffId ? open.kind : null}
                onOpen={(kind) => {
                  setNotice(null);
                  setOpen({ kind, staffId: row.staffId });
                }}
                onClose={() => setOpen(null)}
                onDone={done}
                onError={handle}
                onHistory={() => setHistory({ staffId: row.staffId, fullName: row.fullName })}
              />
            ))}
          </ul>
        </>
      )}

      <section aria-labelledby="export-title" className="export">
        <h2 id="export-title">Ekspor CSV</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setNotice(null);
            void exportAction.run(() => api.exportCsv(exportFrom, exportTo));
          }}
        >
          <div className="row tight">
            <label>
              Dari
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} required />
            </label>
            <label>
              Sampai
              <input type="date" value={exportTo} min={exportFrom} onChange={(e) => setExportTo(e.target.value)} required />
            </label>
          </div>
          <p className="muted">Berisi laporan dan Tidak Hadir. Rentang maksimal 366 hari.</p>
          {exportAction.error && (
            <p role="alert" className="error">
              {exportAction.error}
            </p>
          )}
          <div>
            <button type="submit" disabled={exportAction.busy}>
              {exportAction.busy ? "Menyiapkan…" : "Unduh CSV"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

function RecapItem({
  row,
  date,
  open,
  onOpen,
  onClose,
  onDone,
  onError,
  onHistory,
}: {
  row: RecapRow;
  date: string;
  open: Open["kind"] | null;
  onOpen: (kind: Open["kind"]) => void;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (e: unknown) => void;
  onHistory: () => void;
}) {
  const hasReport = row.status === "terkirim" || row.status === "diisi_admin";

  return (
    <li>
      <div className="recap-main">
        <div>
          <strong>{row.fullName}</strong>
          <div className="muted">{row.identifier}</div>
        </div>
        <span className={`badge badge-${row.status}`}>
          {STATUS_LABEL[row.status]}
          {row.absence && ` (${row.absence.category})`}
        </span>
      </div>

      {row.absence?.note && <p className="muted full">Catatan Admin: {row.absence.note}</p>}
      {row.cancelled && <p className="muted full">Laporan pada tanggal ini pernah dibatalkan Admin.</p>}
      {row.report && (
        <details className="full">
          <summary>Lihat laporan ({row.report.tasks.length} tugas)</summary>
          <ReportView report={row.report} />
        </details>
      )}

      <div className="row tight full">
        {row.status === "belum_mengirim" && (
          <>
            <button type="button" className="secondary" onClick={() => onOpen("mark")}>
              Tandai Tidak Hadir
            </button>
            <button type="button" className="secondary" onClick={() => onOpen("save")}>
              Isi laporan
            </button>
          </>
        )}
        {hasReport && (
          <>
            <button type="button" className="secondary" onClick={() => onOpen("save")}>
              Ubah laporan
            </button>
            <button type="button" className="secondary" onClick={() => onOpen("cancel")}>
              Batalkan laporan
            </button>
          </>
        )}
        {row.status === "tidak_hadir" && (
          <button type="button" className="secondary" onClick={() => onOpen("revoke")}>
            Cabut tanda Tidak Hadir
          </button>
        )}
        <button type="button" className="secondary" onClick={onHistory}>
          Riwayat
        </button>
      </div>

      {open === "mark" && (
        <div className="full">
          <Panel title={`Tandai ${row.fullName} Tidak Hadir`}>
            <MarkAbsenceForm staff={{ id: row.staffId }} defaultDate={date} onDone={onDone} onCancel={onClose} onError={onError} />
          </Panel>
        </div>
      )}
      {open === "save" && (
        <div className="full">
          <Panel title={hasReport ? `Ubah laporan ${row.fullName}` : `Isi laporan ${row.fullName}`}>
            <SaveReportForm
              staffId={row.staffId}
              date={date}
              initial={row.report}
              onDone={onDone}
              onCancel={onClose}
              onError={onError}
            />
          </Panel>
        </div>
      )}
      {open === "cancel" && (
        <div className="full">
          <Panel title={`Batalkan laporan ${row.fullName}`}>
            <ReasonForm
              intro="Laporan berstatus Dibatalkan dan Staff tidak bisa mengirim ulang pada tanggal ini. Admin masih bisa mengisinya kembali."
              submitLabel="Batalkan laporan"
              onSubmit={async (reason) => {
                await api.cancelReport(row.staffId, date, reason);
                return "Laporan dibatalkan.";
              }}
              onDone={onDone}
              onCancel={onClose}
              onError={onError}
            />
          </Panel>
        </div>
      )}
      {open === "revoke" && (
        <div className="full">
          <Panel title={`Cabut tanda Tidak Hadir ${row.fullName}`}>
            <ReasonForm
              intro="Tanda Tidak Hadir pada tanggal ini dihapus."
              submitLabel="Cabut tanda"
              onSubmit={async (reason) => {
                await api.revokeAbsence(row.staffId, date, reason);
                return "Tanda Tidak Hadir dicabut.";
              }}
              onDone={onDone}
              onCancel={onClose}
              onError={onError}
            />
          </Panel>
        </div>
      )}
    </li>
  );
}
