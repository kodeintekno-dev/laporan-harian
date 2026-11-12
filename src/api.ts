export type Me =
  | { role: "admin"; username: string; fullName: string }
  | {
      role: "staff";
      fullName: string;
      displayName: string | null;
      identifier: string;
      email: string;
      status: "menunggu" | "aktif" | "ditolak" | "nonaktif";
      hasBackupPassword: boolean;
    };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi Anda.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (init.signal?.aborted) throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi Anda.", 0);
  if (!res.ok) throw new ApiError(body.error ?? "Terjadi kesalahan.", res.status);
  return body as T;
}

export type Report = {
  reportDate: string;
  tasks: string[];
  note: string | null;
  submittedAt: number;
  source: "staff" | "admin";
};

export type Today = {
  date: string;
  isWeekend: boolean;
  report: Report | null;
  cancelled: boolean;
  absence: { category: string } | null;
};

export type AbsenceMark = { date: string; category: string };

export type HistoryPage = { items: Report[]; absences: AbsenceMark[]; nextBefore: string | null };

export const ABSENCE_CATEGORIES = ["Sakit", "Izin", "Cuti", "Tanpa Keterangan"] as const;

export type RecapStatus = "terkirim" | "diisi_admin" | "tidak_hadir" | "belum_mengirim";

export type RecapRow = {
  staffId: number;
  identifier: string;
  fullName: string;
  status: RecapStatus;
  report: Report | null;
  absence: { category: string; note: string | null } | null;
  cancelled: boolean;
};

export type Recap = {
  date: string;
  isWeekend: boolean;
  rows: RecapRow[];
  summary: { terkirim: number; diisiAdmin: number; tidakHadir: number; belumMengirim: number };
};

export type AdminHistoryItem = {
  date: string;
  report: (Report & { status: "aktif" | "dibatalkan" }) | null;
  absence: { category: string; note: string | null } | null;
};

export type AdminHistoryPage = {
  staff: { id: number; identifier: string; fullName: string; status: string };
  items: AdminHistoryItem[];
  nextBefore: string | null;
};

export const JABATAN_LIST = [
  "Kepala Sekolah",
  "Wakil Kepala Sekolah",
  "Admin Keuangan",
  "Staf",
  "Kabid Diknas",
  "Kabid IT",
  "Kabid Kesiswaan",
  "Kabid Sarpras",
  "Tim Diknas (Mentor)",
  "Tim IT",
  "Tim Kesiswaan (Musyrif)",
  "Tim Sarpras",
  "Branding & Marketing",
  "Resto & Mart",
] as const;

export type Jabatan = (typeof JABATAN_LIST)[number];

export type StaffRow = {
  id: number;
  email: string;
  fullName: string;
  displayName: string | null;
  identifier: string;
  phone: string;
  status: "menunggu" | "aktif" | "ditolak" | "nonaktif";
  jabatan: Jabatan[];
  hasGoogleLinked: boolean;
  hasBackupPassword: boolean;
  createdAt: number;
  decidedAt: number | null;
};

/** Unduh CSV lewat fetch (bukan tautan) supaya galat dari server tampil sebagai pesan, bukan berkas JSON. */
async function downloadExport(from: string, to: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi Anda.", 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "Terjadi kesalahan.", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `laporan-${from}_${to}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  staffList: () => request<{ items: StaffRow[] }>("/api/admin/staff"),
  staffDecide: (id: number, action: "setujui" | "tolak") =>
    request<{ staff: StaffRow }>("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify({ id, action }),
    }),
  staffLink: (pendaftarId: number, staffId: number) =>
    request<{ staff: StaffRow }>("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify({ action: "link", pendaftarId, staffId }),
    }),
  staffUpdate: (id: number, changes: { fullName?: string; displayName?: string | null; status?: "aktif" | "nonaktif" }) =>
    request<{ staff: StaffRow }>("/api/admin/staff/update", {
      method: "POST",
      body: JSON.stringify({ id, ...changes }),
    }),
  staffResetPassword: (id: number) =>
    request<{ staff: StaffRow }>("/api/admin/staff/reset-password", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  staffSetJabatan: (id: number, jabatan: string[]) =>
    request<{ staff: StaffRow }>("/api/admin/staff/jabatan", {
      method: "POST",
      body: JSON.stringify({ id, jabatan }),
    }),
  recap: (date?: string) => request<Recap>(`/api/admin/recap${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  adminHistory: (staffId: number, before?: string) =>
    request<AdminHistoryPage>(
      `/api/admin/history?staffId=${staffId}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    ),
  exportCsv: downloadExport,
  markAbsence: (input: { staffId: number; dateFrom: string; dateTo?: string; category: string; note: string }) =>
    request<{ created: number; skipped: number }>("/api/admin/absence/mark", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeAbsence: (staffId: number, date: string, reason: string) =>
    request<{ revoked: true }>("/api/admin/absence/revoke", {
      method: "POST",
      body: JSON.stringify({ staffId, date, reason }),
    }),
  saveReport: (input: { staffId: number; date: string; tasks: string[]; note: string; reason: string }) =>
    request<{ report: Report }>("/api/admin/report/save", { method: "POST", body: JSON.stringify(input) }),
  cancelReport: (staffId: number, date: string, reason: string) =>
    request<{ cancelled: true }>("/api/admin/report/cancel", {
      method: "POST",
      body: JSON.stringify({ staffId, date, reason }),
    }),
  today: () => request<Today>("/api/reports/today"),
  history: (before?: string) =>
    request<HistoryPage>(`/api/reports/history${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  submitReport: (tasks: string[], note: string) =>
    request<{ report: Report }>("/api/reports", { method: "POST", body: JSON.stringify({ tasks, note }) }),
  me: () => request<Me>("/api/auth/me", { signal: AbortSignal.timeout(10_000) }),
  loginAdmin: (username: string, password: string) =>
    request<Me>("/api/auth/login", { method: "POST", body: JSON.stringify({ mode: "admin", username, password }) }),
  loginStaff: (phone: string, password: string) =>
    request<Me>("/api/auth/login", { method: "POST", body: JSON.stringify({ mode: "staff", phone, password }) }),
  register: (fullName: string, phone: string) =>
    request<{ ok: true; status: "menunggu" }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ fullName, phone }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string | null, newPassword: string) =>
    request<{ ok: true }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
