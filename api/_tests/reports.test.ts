import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.SESSION_SECRET = "x".repeat(48);
process.env.ADMIN_USERNAME = "kepala";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("password-admin-panjang", 4);

const { getDb } = await import("../_lib/db.js");
const { signSession, sessionCookie } = await import("../_lib/session.js");
const { dateWib, addDays } = await import("../_lib/time.js");
const submit = await import("../_handlers/reports/index.js");
const today = await import("../_handlers/reports/today.js");
const history = await import("../_handlers/reports/history.js");

const TODAY = dateWib();

async function seedStaff(email: string, mustChange = 0): Promise<{ id: number; cookie: string }> {
  const ep = 0;
  const result = await getDb().execute({
    sql: `INSERT INTO staff (email, full_name, phone, status, session_epoch, created_at)
          VALUES (?, ?, ?, 'aktif', ?, ?) RETURNING id`,
    args: [email, `Staff ${email}`, `+628${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`, ep, 1000],
  });
  const id = Number(result.rows[0].id);
  const token = await signSession({ role: "staff", staffId: id, ep });
  return { id, cookie: sessionCookie(token).split(";")[0] };
}

async function adminCookie(): Promise<string> {
  const { adminFingerprint } = await import("../_lib/session.js");
  const token = await signSession({ role: "admin", pv: adminFingerprint() });
  return sessionCookie(token).split(";")[0];
}

function post(body: unknown, cookie?: string): Request {
  return new Request("https://staff.test/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ expectedDate: dateWib(), ...(body as object) }),
  });
}

function get(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

async function insertReport(staffId: number, date: string, status = "aktif", source = "staff") {
  await getDb().execute({
    sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
          VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    args: [staffId, date, JSON.stringify([`tugas ${date}`]), 5000, source, status],
  });
}

beforeAll(async () => {
  const sql = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0001_init.sql"), "utf8");
  await getDb().executeMultiple(sql);
  const sql2 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0002_google_sso.sql"), "utf8");
  await getDb().executeMultiple(sql2);
  const sql3 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0003_jabatan.sql"), "utf8");
  await getDb().executeMultiple(sql3);
  const roles = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0005_delegated_admin.sql"), "utf8");
  await getDb().executeMultiple(roles);
  await getDb().executeMultiple(await readFile(join(import.meta.dirname, "../../db/migrations/0007_report_schedule.sql"), "utf8"));
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00+07:00`));
  const db = getDb();
  await db.execute("DELETE FROM report_schedule");
  await db.execute("DELETE FROM reporting_policy");
  await db.execute("DELETE FROM daily_report");
  await db.execute("DELETE FROM absence");
  await db.execute("DELETE FROM staff");
});

afterEach(() => vi.useRealTimers());

describe("POST /api/reports", () => {
  it("membuka pengiriman umum pukul 15.45 WIB dan menolak formulir lama tepat tengah malam", async () => {
    const { cookie } = await seedStaff("budi");
    const send = () => submit.POST(post({ tasks: ["a"], expectedDate: TODAY }, cookie));
    vi.setSystemTime(new Date(`${TODAY}T15:44:59.999+07:00`));
    expect((await send()).status).toBe(403);
    vi.setSystemTime(new Date(`${TODAY}T15:45:00+07:00`));
    expect((await send()).status).toBe(201);
    vi.setSystemTime(new Date(`${addDays(TODAY, 1)}T00:00:00+07:00`));
    expect((await send()).status).toBe(400);
  });

  it("memakai tanggal awal sif untuk jam kirim, piket, dan pengecualian Musyrif", async () => {
    const start = "2026-11-15";
    const morning = "2026-11-16";
    vi.setSystemTime(new Date(`${morning}T07:14:59.999+07:00`));
    const { id, cookie } = await seedStaff("musyrif");
    const db = getDb();
    await db.execute({ sql: "INSERT INTO report_schedule VALUES (?, ?, 1)", args: [id, start] });
    await db.execute({ sql: "INSERT INTO reporting_policy VALUES (?, ?, 1)", args: [id, morning] });
    const send = () => submit.POST(post({ tasks: ["Piket"], expectedDate: start }, cookie));
    const status = async () => (await today.GET(get("https://staff.test/api/reports/today", cookie))).json();
    expect(await status()).toMatchObject({ date: start, isWeekend: true, isOpen: false, reportingExempt: false });
    expect((await send()).status).toBe(403);
    vi.setSystemTime(new Date(`${morning}T07:15:00+07:00`));
    expect(await status()).toMatchObject({ date: start, isOpen: true });
    vi.setSystemTime(new Date(`${morning}T14:59:59.999+07:00`));
    const result = await send();
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ report: { reportDate: start, submittedAt: Date.now() } });
    vi.setSystemTime(new Date(`${morning}T15:00:00+07:00`));
    expect(await status()).toMatchObject({ date: morning, isWeekend: false, isOpen: false, reportingExempt: true });
    expect((await send()).status).toBe(400);
  });

  it("menyimpan laporan hari ini dengan Waktu Keluar dari server", async () => {
    const { id, cookie } = await seedStaff("budi");
    const before = Date.now();
    const res = await submit.POST(post({ tasks: ["  Mengajar kelas 7  ", "Rapat"], note: "  lancar " }, cookie));
    expect(res.status).toBe(201);

    const row = (await getDb().execute({ sql: "SELECT * FROM daily_report WHERE staff_id = ?", args: [id] })).rows[0];
    expect(row.report_date).toBe(TODAY);
    expect(JSON.parse(String(row.tasks_json))).toEqual(["Mengajar kelas 7", "Rapat"]);
    expect(row.note).toBe("lancar");
    expect(row.source).toBe("staff");
    expect(row.status).toBe("aktif");
    expect(Number(row.submitted_at)).toBeGreaterThanOrEqual(before);
  });

  it("mengabaikan tanggal dan field lain dari klien", async () => {
    const { id, cookie } = await seedStaff("budi");
    const res = await submit.POST(
      post({ tasks: ["a"], reportDate: "2020-01-01", source: "admin", submittedAt: 1 }, cookie),
    );
    expect(res.status).toBe(201);
    const row = (await getDb().execute({ sql: "SELECT * FROM daily_report WHERE staff_id = ?", args: [id] })).rows[0];
    expect(row.report_date).toBe(TODAY);
    expect(row.source).toBe("staff");
    expect(Number(row.submitted_at)).toBeGreaterThan(1);
  });

  it("catatan kosong disimpan sebagai NULL", async () => {
    const { id, cookie } = await seedStaff("budi");
    await submit.POST(post({ tasks: ["a"], note: "   " }, cookie));
    const row = (await getDb().execute({ sql: "SELECT note FROM daily_report WHERE staff_id = ?", args: [id] })).rows[0];
    expect(row.note).toBeNull();
  });

  it("laporan kedua di hari yang sama ditolak dan isi pertama tidak berubah", async () => {
    const { id, cookie } = await seedStaff("budi");
    expect((await submit.POST(post({ tasks: ["pertama"] }, cookie))).status).toBe(201);
    const second = await submit.POST(post({ tasks: ["kedua"] }, cookie));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toMatch(/sudah terkirim/);
    const row = (await getDb().execute({ sql: "SELECT tasks_json FROM daily_report WHERE staff_id = ?", args: [id] })).rows[0];
    expect(JSON.parse(String(row.tasks_json))).toEqual(["pertama"]);
  });

  it("dua pengiriman bersamaan hanya menghasilkan satu laporan", async () => {
    const { id, cookie } = await seedStaff("budi");
    const results = await Promise.all([
      submit.POST(post({ tasks: ["a"] }, cookie)),
      submit.POST(post({ tasks: ["b"] }, cookie)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const count = (await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM daily_report WHERE staff_id = ?", args: [id] })).rows[0];
    expect(Number(count.n)).toBe(1);
  });

  it("ditolak jika Admin sudah menandai Tidak Hadir hari ini", async () => {
    const { id, cookie } = await seedStaff("budi");
    await getDb().execute({
      sql: "INSERT INTO absence (staff_id, absence_date, category, created_at) VALUES (?, ?, 'Sakit', 1)",
      args: [id, TODAY],
    });
    const res = await submit.POST(post({ tasks: ["a"] }, cookie));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Tidak Hadir/);
    const count = (await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM daily_report", args: [] })).rows[0];
    expect(Number(count.n)).toBe(0);
  });

  it("tidak bisa mengirim ulang jika laporan hari ini Dibatalkan", async () => {
    const { id, cookie } = await seedStaff("budi");
    await insertReport(id, TODAY, "dibatalkan");
    const res = await submit.POST(post({ tasks: ["a"] }, cookie));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/dibatalkan/);
  });

  it.each([
    ["tanpa tugas", { tasks: [] }],
    ["tugas kosong", { tasks: ["   "] }],
    ["tugas bukan teks", { tasks: [123] }],
    ["tugas lebih dari 500 karakter", { tasks: ["a".repeat(501)] }],
    ["lebih dari 50 tugas", { tasks: Array.from({ length: 51 }, (_, i) => `t${i}`) }],
    ["catatan lebih dari 1000 karakter", { tasks: ["a"], note: "n".repeat(1001) }],
    ["tanpa field tasks", {}],
  ])("menolak %s", async (_name, body) => {
    const { cookie } = await seedStaff("budi");
    const res = await submit.POST(post(body, cookie));
    expect(res.status).toBe(400);
    const count = (await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM daily_report", args: [] })).rows[0];
    expect(Number(count.n)).toBe(0);
  });

  it("menerima tepat 50 tugas, 500 karakter, dan catatan 1000 karakter", async () => {
    const { cookie } = await seedStaff("budi");
    const res = await submit.POST(
      post({ tasks: Array.from({ length: 50 }, () => "a".repeat(500)), note: "n".repeat(1000) }, cookie),
    );
    expect(res.status).toBe(201);
  });

  it("tanpa login 401, Admin 403", async () => {
    expect((await submit.POST(post({ tasks: ["a"] }))).status).toBe(401);
    expect((await submit.POST(post({ tasks: ["a"] }, await adminCookie()))).status).toBe(403);
  });
});

describe("GET /api/reports/today", () => {
  const url = "https://staff.test/api/reports/today";

  it("belum mengirim", async () => {
    const { cookie } = await seedStaff("budi");
    const body = await (await today.GET(get(url, cookie))).json();
    expect(body).toMatchObject({ date: TODAY, report: null, cancelled: false, absence: null });
  });

  it("sudah mengirim", async () => {
    const { id, cookie } = await seedStaff("budi");
    await insertReport(id, TODAY);
    const body = await (await today.GET(get(url, cookie))).json();
    expect(body.report).toMatchObject({ reportDate: TODAY, tasks: [`tugas ${TODAY}`], source: "staff" });
  });

  it("Dibatalkan tidak menampilkan isi laporan", async () => {
    const { id, cookie } = await seedStaff("budi");
    await insertReport(id, TODAY, "dibatalkan");
    const body = await (await today.GET(get(url, cookie))).json();
    expect(body).toMatchObject({ report: null, cancelled: true });
  });

  it("Tidak Hadir", async () => {
    const { id, cookie } = await seedStaff("budi");
    await getDb().execute({
      sql: "INSERT INTO absence (staff_id, absence_date, category, created_at) VALUES (?, ?, 'Izin', 1)",
      args: [id, TODAY],
    });
    const body = await (await today.GET(get(url, cookie))).json();
    expect(body.absence).toEqual({ category: "Izin" });
  });

  it("tanpa login 401, Admin 403", async () => {
    expect((await today.GET(get(url))).status).toBe(401);
    expect((await today.GET(get(url, await adminCookie()))).status).toBe(403);
  });
});

describe("GET /api/reports/history", () => {
  const url = "https://staff.test/api/reports/history";

  it("hanya laporan milik sendiri, terbaru dulu, tanpa yang Dibatalkan", async () => {
    const budi = await seedStaff("budi");
    const sari = await seedStaff("sari");
    await insertReport(budi.id, "2026-11-10");
    await insertReport(budi.id, "2026-11-11");
    await insertReport(budi.id, "2026-11-09", "dibatalkan");
    await insertReport(sari.id, "2026-11-10");

    const body = await (await history.GET(get(url, budi.cookie))).json();
    expect(body.items.map((r: { reportDate: string }) => r.reportDate)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(body.nextBefore).toBeNull();
  });

  it("paginasi dengan kursor tanggal", async () => {
    const { id, cookie } = await seedStaff("budi");
    for (let i = 0; i < 40; i++) await insertReport(id, addDays("2026-01-01", i));

    const first = await (await history.GET(get(url, cookie))).json();
    expect(first.items).toHaveLength(31);
    expect(first.items[0].reportDate).toBe(addDays("2026-01-01", 39));
    expect(first.nextBefore).toBe(first.items[30].reportDate);

    const second = await (await history.GET(get(`${url}?before=${first.nextBefore}`, cookie))).json();
    expect(second.items).toHaveLength(9);
    expect(second.nextBefore).toBeNull();
  });

  it("menolak parameter before yang bukan tanggal", async () => {
    const { cookie } = await seedStaff("budi");
    expect((await history.GET(get(`${url}?before=bukan-tanggal`, cookie))).status).toBe(400);
  });

  it("tanpa login 401, Admin 403", async () => {
    expect((await history.GET(get(url))).status).toBe(401);
    expect((await history.GET(get(url, await adminCookie()))).status).toBe(403);
  });
});
