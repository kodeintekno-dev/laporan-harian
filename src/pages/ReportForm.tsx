import { useRef, useState, type FormEvent } from "react";
import { api, ApiError, type Report } from "../api";
import { MAX_NOTE_LENGTH, MAX_TASK_LENGTH, MAX_TASKS } from "../../shared/report-limits";

type Item = { id: number; text: string };

export function ReportForm({ onSubmitted, onConflict }: { onSubmitted: (report: Report) => void; onConflict: () => void }) {
  const nextId = useRef(2);
  const [items, setItems] = useState<Item[]>([{ id: 1, text: "" }]);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastInput = useRef<HTMLTextAreaElement | null>(null);

  const filled = items.map((i) => i.text.trim()).filter(Boolean);

  function update(id: number, text: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  function add() {
    setItems((prev) => [...prev, { id: nextId.current++, text: "" }]);
    // Fokus ke isian baru setelah render.
    setTimeout(() => lastInput.current?.focus(), 0);
  }

  function remove(id: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }

  function review(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (filled.length === 0) {
      setError("Isi minimal satu tugas.");
      return;
    }
    setConfirming(true);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { report } = await api.submitReport(filled, note);
      onSubmitted(report);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onConflict();
        return;
      }
      setError(e instanceof ApiError ? e.message : "Terjadi kesalahan.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <section aria-labelledby="confirm-title">
        <h2 id="confirm-title">Kirim laporan sekarang?</h2>
        <p className="muted">
          Laporan tidak bisa diubah setelah dikirim, dan waktu pengiriman dicatat sebagai waktu Anda keluar.
        </p>
        <ol className="task-list">
          {filled.map((task, index) => (
            <li key={index}>{task}</li>
          ))}
        </ol>
        {note.trim() && <p className="muted">Catatan: {note.trim()}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" onClick={send} disabled={busy}>
            {busy ? "Mengirim…" : "Kirim dan keluar"}
          </button>
          <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Kembali mengedit
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={review} aria-label="Laporan harian">
      {items.map((item, index) => (
        <div key={item.id} className="task-row">
          <label>
            Tugas {index + 1}
            <textarea
              ref={index === items.length - 1 ? lastInput : undefined}
              value={item.text}
              onChange={(e) => update(item.id, e.target.value)}
              maxLength={MAX_TASK_LENGTH}
              rows={2}
            />
            <small className="muted">
              {item.text.length}/{MAX_TASK_LENGTH}
            </small>
          </label>
          {items.length > 1 && (
            <button type="button" className="secondary" onClick={() => remove(item.id)} aria-label={`Hapus tugas ${index + 1}`}>
              Hapus
            </button>
          )}
        </div>
      ))}
      <div>
        <button type="button" className="secondary" onClick={add} disabled={items.length >= MAX_TASKS}>
          Tambah tugas
        </button>
        {items.length >= MAX_TASKS && <small className="muted"> Maksimal {MAX_TASKS} tugas.</small>}
      </div>
      <label>
        Catatan (opsional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LENGTH} rows={3} />
        <small className="muted">
          {note.length}/{MAX_NOTE_LENGTH}
        </small>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit">Tinjau laporan</button>
    </form>
  );
}
