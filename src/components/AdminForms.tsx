import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ABSENCE_CATEGORIES, api, type Report } from "../api";
import { MAX_NOTE_LENGTH, MAX_TASK_LENGTH, MAX_TASKS } from "../../shared/report-limits";
import { useAction } from "./useAction";

type Common = {
  onCancel: () => void;
  onError: (e: unknown) => void;
};

/** Panel inline untuk satu aksi Admin. Fokus pindah ke panel saat muncul. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <section ref={ref} tabIndex={-1} className="panel" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {children}
    </section>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="error">
      {message}
    </p>
  );
}

export function MarkAbsenceForm({
  staff,
  defaultDate,
  onDone,
  onCancel,
  onError,
}: Common & { staff: { id: number }; defaultDate: string; onDone: (message: string) => void }) {
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState<string>(ABSENCE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction(onError);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const res = await api.markAbsence({
        staffId: staff.id,
        dateFrom,
        dateTo: dateTo || undefined,
        category,
        note,
      });
      onDone(
        `${res.created} tanggal ditandai Tidak Hadir${res.skipped > 0 ? `, ${res.skipped} dilewati karena sudah ditandai` : ""}.`,
      );
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="row tight">
        <label>
          Tanggal mulai
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
        </label>
        <label>
          Tanggal akhir (opsional)
          <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>
      <label>
        Kategori
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {ABSENCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Catatan (opsional, hanya terlihat Admin)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LENGTH} rows={2} />
      </label>
      <ErrorLine message={error} />
      <div className="row tight">
        <button type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : "Tandai Tidak Hadir"}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </button>
      </div>
    </form>
  );
}

/** Form satu isian: alasan wajib untuk aksi yang dicatat di Log Koreksi. */
export function ReasonForm({
  intro,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
  onError,
}: Common & {
  intro: string;
  submitLabel: string;
  onSubmit: (reason: string) => Promise<string>;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onError);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      onDone(await onSubmit(reason));
    });
  }

  return (
    <form onSubmit={submit}>
      <p className="muted">{intro}</p>
      <label>
        Alasan (wajib, dicatat di Log Koreksi)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          required
        />
      </label>
      <ErrorLine message={error} />
      <div className="row tight">
        <button type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </button>
      </div>
    </form>
  );
}

type Item = { id: number; text: string };

export function SaveReportForm({
  staffId,
  date,
  initial,
  onDone,
  onCancel,
  onError,
}: Common & { staffId: number; date: string; initial: Report | null; onDone: (message: string) => void }) {
  const nextId = useRef(2);
  const [items, setItems] = useState<Item[]>(() =>
    initial && initial.tasks.length > 0 ? initial.tasks.map((text, i) => ({ id: i + 1, text })) : [{ id: 1, text: "" }],
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onError);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastInput = useRef<HTMLTextAreaElement | null>(null);

  if (initial && nextId.current <= initial.tasks.length) nextId.current = initial.tasks.length + 1;

  function update(id: number, text: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  function add() {
    setItems((prev) => [...prev, { id: nextId.current++, text: "" }]);
    setTimeout(() => lastInput.current?.focus(), 0);
  }

  function remove(id: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const tasks = items.map((i) => i.text.trim()).filter(Boolean);
    if (tasks.length === 0) {
      setLocalError("Isi minimal satu tugas.");
      return;
    }
    setLocalError(null);
    await run(async () => {
      await api.saveReport({ staffId, date, tasks, note, reason });
      onDone(initial ? "Laporan diperbarui." : "Laporan disimpan.");
    });
  }

  return (
    <form onSubmit={submit}>
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
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LENGTH} rows={2} />
      </label>
      <label>
        Alasan koreksi (wajib, dicatat di Log Koreksi)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_NOTE_LENGTH} rows={2} required />
      </label>
      <ErrorLine message={localError ?? error} />
      <div className="row tight">
        <button type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Simpan laporan"}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </button>
      </div>
    </form>
  );
}
