import type { Row } from "@libsql/client";
import { z } from "zod";
import { MAX_NOTE_LENGTH, MAX_TASK_LENGTH, MAX_TASKS } from "../../shared/report-limits.js";

export const reportInputSchema = z.object({
  tasks: z
    .array(
      z
        .string("Uraian tugas harus berupa teks.")
        .trim()
        .min(1, "Uraian tugas tidak boleh kosong.")
        .max(MAX_TASK_LENGTH, `Uraian tugas maksimal ${MAX_TASK_LENGTH} karakter.`),
    )
    .min(1, "Isi minimal satu tugas.")
    .max(MAX_TASKS, `Maksimal ${MAX_TASKS} tugas per laporan.`),
  note: z
    .string()
    .trim()
    .max(MAX_NOTE_LENGTH, `Catatan maksimal ${MAX_NOTE_LENGTH} karakter.`)
    .nullish()
    .transform((value) => value || null),
});

export type ReportView = {
  reportDate: string;
  tasks: string[];
  note: string | null;
  submittedAt: number;
  source: "staff" | "admin";
};

export function toReportView(row: Row): ReportView {
  return {
    reportDate: String(row.report_date),
    tasks: JSON.parse(String(row.tasks_json)) as string[],
    note: row.note == null ? null : String(row.note),
    submittedAt: Number(row.submitted_at),
    source: String(row.source) === "admin" ? "admin" : "staff",
  };
}
