import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.SESSION_SECRET = "x".repeat(48);
process.env.ADMIN_USERNAME = "kepala";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("password-admin-panjang", 4);

const { getDb } = await import("../_lib/db.js");
const { signSession, sessionCookie, adminFingerprint } = await import("../_lib/session.js");
const { dateWib, addDays } = await import("../_lib/time.js");
const { csvCell } = await import("../_lib/csv.js");
const recap = await import("../admin/recap.js");
const mark = await import("../admin/absence/mark.js");
const revoke = await import("../admin/absence/revoke.js");
const save = await import("../admin/report/save.js");
const cancel = await import("../admin/report/cancel.js");
const exportCsv = await import("../admin/export.js");
const adminHistory = await import("../admin/history.js");
const staffHistory = await import("../reports/history.js");
const submit = await import("../reports/index.js");

const TODAY = dateWib();
// Tanggal tetap di masa lalu (Jumat dan Sabtu), supaya Koreksi tidak ditolak sebagai tanggal masa depan.
const FRIDAY = "2026-11-06";
const SATURDAY = "2026-11-07";

async function seedStaff(email: string, status: "aktif" | "nonaktif" = "aktif"): Promise<{ id: number; cookie: string }> {
  const ep = 0;
  const result = await getDb().execute({
    sql: `INSERT INTO staff (email, full_name, phone, status, session_epoch, created_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [email, `Staff ${email}`, `+628${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`, status, ep, 1000],
  });
  const id = Number(result.rows[0].id);
  const token = await signSession({ role: "staff", staffId: id, ep });
  return { id, cookie: sessionCookie(token).split(";")[0] };
}

async function adminCookie(): Promise<string> {
  return sessionCookie(await signSession({ role: "admin", pv: adminFingerprint() })).split(";")[0];
}

function post(body: unknown, cookie?: string): Request {
  return new Request("https://staff.test/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function get(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

async function insertReport(staffId: number, date: string, opts: { status?: string; source?: string; at?: number } = {}) {
  await getDb().execute({
    sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
          VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    args: [staffId, date, JSON.stringify([`tugas ${date}`]), opts.at ?? 5000, opts.source ?? "staff", opts.status ?? "aktif"],
  });
}

async function insertAbsence(staffId: number, date: string, category = "Sakit", note: string | null = null) {
  await getDb().execute({
    sql: "INSERT INTO absence (staff_id, absence_date, category, note, created_at) VALUES (?, ?, ?, ?, 1)",
    args: [staffId, date, category, note],
  });
}

async function logs() {
  const rows = (await getDb().execute("SELECT * FROM correction_log ORDER BY id")).rows;
  return rows.map((r) => ({
    type: String(r.target_type),
    staffId: Number(r.staff_id),
    date: String(r.target_date),
    action: String(r.action),
    reason: String(r.reason),
    before: r.before_json == null ? null : JSON.parse(String(r.before_json)),
    after: r.after_json == null ? null : JSON.parse(String(r.after_json)),
  }));
}

beforeAll(async () => {
  const sql = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0001_init.sql"), "utf8");
  await getDb().executeMultiple(sql);
  const sql2 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0002_google_sso.sql"), "utf8");
  await getDb().executeMultiple(sql2);
  const sql3 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0003_jabatan.sql"), "utf8");
  await getDb().executeMultiple(sql3);
});

beforeEach(async () => {
  const db = getDb();
  await db.execute("DELETE FROM correction_log");
  await db.execute("DELETE FROM daily_report");
  await db.execute("DELETE FROM absence");
  await db.execute("DELETE FROM staff");
});

describe("akses", () => {
  it("setiap endpoint baru menolak tanpa login (401) dan Staff (403)", async () => {
    const { cookie } = await seedStaff("budi@test.id");
    const cases: Array<[string, (c?: string) => Promise<Response>]> = [
      ["recap", (c) => recap.GET(get("https://staff.test/api/admin/recap", c))],
      ["export", (c) => exportCsv.GET(get(`https://staff.test/api/admin/export?from=${FRIDAY}&to=${FRIDAY}`, c))],
      ["history", (c) => adminHistory.GET(get("https://staff.test/api/admin/history?staffId=1", c))],
      ["mark", (c) => mark.POST(post({ staffId: 1, dateFrom: TODAY, category: "Sakit" }, c))],
      ["revoke", (c) => revoke.POST(post({ staffId: 1, date: TODAY, reason: "x" }, c))],
      ["save", (c) => save.POST(post({ staffId: 1, date: TODAY, tasks: ["a"], reason: "x" }, c))],
      ["cancel", (c) => cancel.POST(post({ staffId: 1, date: TODAY, reason: "x" }, c))],
    ];
    for (const [name, call] of cases) {
      expect((await call()).status, `${name} tanpa login`).toBe(401);
      expect((await call(cookie)).status, `${name} sebagai Staff`).toBe(403);
    }
  });
});

describe("GET /api/admin/recap", () => {
  it("hari kerja: memetakan status tiap Staff Aktif", async () => {
    const admin = await adminCookie();
    const kirim = await seedStaff("kirim@test.id");
    const diisi = await seedStaff("diisi@test.id");
    const absen = await seedStaff("absen@test.id");
    await seedStaff("belum@test.id");
    await insertReport(kirim.id, FRIDAY);
    await insertReport(diisi.id, FRIDAY, { source: "admin" });
    await insertAbsence(absen.id, FRIDAY, "Izin", "urusan keluarga");

    const body = await (await recap.GET(get(`https://staff.test/api/admin/recap?date=${FRIDAY}`, admin))).json();
    expect(body.isWeekend).toBe(false);
    const status = Object.fromEntries(body.rows.map((r: { identifier: string; status: string }) => [r.identifier, r.status]));
    expect(status).toEqual({
      "kirim@test.id": "terkirim",
      "diisi@test.id": "diisi_admin",
      "absen@test.id": "tidak_hadir",
      "belum@test.id": "belum_mengirim",
    });
    expect(body.summary).toEqual({ terkirim: 1, diisiAdmin: 1, tidakHadir: 1, belumMengirim: 1 });
    const absenRow = body.rows.find((r: { identifier: string }) => r.identifier === "absen@test.id");
    expect(absenRow.absence).toEqual({ category: "Izin", note: "urusan keluarga" });
  });

  it("laporan Dibatalkan tidak dihitung dan ditandai cancelled", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, FRIDAY, { status: "dibatalkan" });
    const body = await (await recap.GET(get(`https://staff.test/api/admin/recap?date=${FRIDAY}`, admin))).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ status: "belum_mengirim", report: null, cancelled: true });
  });

  it("Staff nonaktif hanya tampil bila punya laporan atau Tidak Hadir pada tanggal itu", async () => {
    const admin = await adminCookie();
    await seedStaff("kosong@test.id", "nonaktif");
    const lapor = await seedStaff("lapor@test.id", "nonaktif");
    const absen = await seedStaff("absen@test.id", "nonaktif");
    await insertReport(lapor.id, FRIDAY);
    await insertAbsence(absen.id, FRIDAY);
    const body = await (await recap.GET(get(`https://staff.test/api/admin/recap?date=${FRIDAY}`, admin))).json();
    expect(body.rows.map((r: { identifier: string }) => r.identifier).sort()).toEqual(["absen@test.id", "lapor@test.id"]);
  });

  it("akhir pekan: hanya Staff Piket dan Tidak Hadir, tanpa Belum Mengirim", async () => {
    const admin = await adminCookie();
    const piket = await seedStaff("piket@test.id");
    const absen = await seedStaff("absen@test.id");
    await seedStaff("libur@test.id");
    await insertReport(piket.id, SATURDAY);
    await insertAbsence(absen.id, SATURDAY, "Cuti");
    const body = await (await recap.GET(get(`https://staff.test/api/admin/recap?date=${SATURDAY}`, admin))).json();
    expect(body.isWeekend).toBe(true);
    expect(body.rows.map((r: { identifier: string }) => r.identifier).sort()).toEqual(["absen@test.id", "piket@test.id"]);
    expect(body.summary.belumMengirim).toBe(0);
  });

  it("tanggal default hari ini dan format salah ditolak", async () => {
    const admin = await adminCookie();
    const body = await (await recap.GET(get("https://staff.test/api/admin/recap", admin))).json();
    expect(body.date).toBe(TODAY);
    expect((await recap.GET(get("https://staff.test/api/admin/recap?date=2026-02-30", admin))).status).toBe(400);
    expect((await recap.GET(get("https://staff.test/api/admin/recap?date=besok", admin))).status).toBe(400);
  });
});

describe("POST /api/admin/absence/mark", () => {
  it("menandai satu tanggal dan mencatat Log Koreksi", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    const res = await mark.POST(post({ staffId: budi.id, dateFrom: TODAY, category: "Sakit", note: " demam " }, admin));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: 1, skipped: 0 });

    const row = (await getDb().execute({ sql: "SELECT * FROM absence WHERE staff_id = ?", args: [budi.id] })).rows[0];
    expect(row.absence_date).toBe(TODAY);
    expect(row.category).toBe("Sakit");
    expect(row.note).toBe("demam");
    expect(await logs()).toEqual([
      {
        type: "tidak_hadir",
        staffId: budi.id,
        date: TODAY,
        action: "tandai",
        reason: "demam",
        before: null,
        after: { category: "Sakit", note: "demam" },
      },
    ]);
  });

  it("menandai rentang dan melewati tanggal yang sudah ditandai", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertAbsence(budi.id, addDays(TODAY, 1), "Izin");
    const res = await mark.POST(
      post({ staffId: budi.id, dateFrom: TODAY, dateTo: addDays(TODAY, 2), category: "Cuti" }, admin),
    );
    expect(await res.json()).toEqual({ created: 2, skipped: 1 });
    const rows = (await getDb().execute("SELECT absence_date, category FROM absence ORDER BY absence_date")).rows;
    expect(rows.map((r) => [r.absence_date, r.category])).toEqual([
      [TODAY, "Cuti"],
      [addDays(TODAY, 1), "Izin"], // tidak ditimpa
      [addDays(TODAY, 2), "Cuti"],
    ]);
    expect(await logs()).toHaveLength(2);
  });

  it("batas jendela: -31 dan +100 boleh, -32 dan +101 ditolak", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    const ok = (date: string) => mark.POST(post({ staffId: budi.id, dateFrom: date, category: "Izin" }, admin));
    expect((await ok(addDays(TODAY, -31))).status).toBe(201);
    expect((await ok(addDays(TODAY, 100))).status).toBe(201);
    expect((await ok(addDays(TODAY, -32))).status).toBe(400);
    expect((await ok(addDays(TODAY, 101))).status).toBe(400);
    const rentang = await mark.POST(
      post({ staffId: budi.id, dateFrom: TODAY, dateTo: addDays(TODAY, 101), category: "Izin" }, admin),
    );
    expect(rentang.status).toBe(400);
  });

  it("menolak seluruh permintaan bila ada laporan aktif di rentang", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, addDays(TODAY, -1));
    const res = await mark.POST(
      post({ staffId: budi.id, dateFrom: addDays(TODAY, -2), dateTo: TODAY, category: "Sakit" }, admin),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).dates).toEqual([addDays(TODAY, -1)]);
    expect((await getDb().execute("SELECT COUNT(*) AS n FROM absence")).rows[0].n).toBe(0);
  });

  it("laporan Dibatalkan tidak menghalangi penandaan", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, TODAY, { status: "dibatalkan" });
    const res = await mark.POST(post({ staffId: budi.id, dateFrom: TODAY, category: "Sakit" }, admin));
    expect(res.status).toBe(201);
  });

  it("validasi: kategori, urutan tanggal, Staff tidak ada", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    expect((await mark.POST(post({ staffId: budi.id, dateFrom: TODAY, category: "Bolos" }, admin))).status).toBe(400);
    expect(
      (await mark.POST(post({ staffId: budi.id, dateFrom: TODAY, dateTo: addDays(TODAY, -1), category: "Izin" }, admin))).status,
    ).toBe(400);
    expect((await mark.POST(post({ staffId: 9999, dateFrom: TODAY, category: "Izin" }, admin))).status).toBe(404);
  });

  it("Staff yang ditandai tidak bisa mengirim laporan hari itu", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await mark.POST(post({ staffId: budi.id, dateFrom: TODAY, category: "Izin" }, admin));
    const res = await submit.POST(
      new Request("https://staff.test/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: budi.cookie },
        body: JSON.stringify({ tasks: ["a"] }),
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/admin/absence/revoke", () => {
  it("mencabut tanda, wajib beralasan, dan mencatat isi sebelumnya", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertAbsence(budi.id, TODAY, "Izin", "acara");

    expect((await revoke.POST(post({ staffId: budi.id, date: TODAY }, admin))).status).toBe(400);
    expect((await revoke.POST(post({ staffId: budi.id, date: TODAY, reason: "   " }, admin))).status).toBe(400);
    expect((await getDb().execute("SELECT COUNT(*) AS n FROM absence")).rows[0].n).toBe(1);

    const res = await revoke.POST(post({ staffId: budi.id, date: TODAY, reason: "salah input" }, admin));
    expect(res.status).toBe(200);
    expect((await getDb().execute("SELECT COUNT(*) AS n FROM absence")).rows[0].n).toBe(0);
    expect(await logs()).toEqual([
      {
        type: "tidak_hadir",
        staffId: budi.id,
        date: TODAY,
        action: "cabut",
        reason: "salah input",
        before: { category: "Izin", note: "acara" },
        after: null,
      },
    ]);
  });

  it("404 bila tidak ada tandanya dan tidak mencatat log", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    expect((await revoke.POST(post({ staffId: budi.id, date: TODAY, reason: "x" }, admin))).status).toBe(404);
    expect(await logs()).toEqual([]);
  });
});

describe("POST /api/admin/report/save", () => {
  it("membuat laporan untuk tanggal lampau tanpa batas ke belakang", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    const res = await save.POST(
      post({ staffId: budi.id, date: "2025-01-06", tasks: ["  Rekap nilai "], note: "", reason: "lupa mengirim" }, admin),
    );
    expect(res.status).toBe(201);
    const { report } = await res.json();
    expect(report).toMatchObject({ reportDate: "2025-01-06", tasks: ["Rekap nilai"], note: null, source: "admin" });

    expect(await logs()).toEqual([
      {
        type: "laporan",
        staffId: budi.id,
        date: "2025-01-06",
        action: "buat",
        reason: "lupa mengirim",
        before: null,
        after: { tasks: ["Rekap nilai"], note: null },
      },
    ]);
  });

  it("boleh untuk hari ini, menolak tanggal masa depan", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    const body = (date: string) => ({ staffId: budi.id, date, tasks: ["a"], reason: "x" });
    expect((await save.POST(post(body(TODAY), admin))).status).toBe(201);
    expect((await save.POST(post(body(addDays(TODAY, 1)), admin))).status).toBe(400);
  });

  it("mengubah laporan aktif tanpa mengubah Waktu Keluar dan sumber aslinya", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, FRIDAY, { at: 777, source: "staff" });
    const res = await save.POST(
      post({ staffId: budi.id, date: FRIDAY, tasks: ["tugas baru"], note: "revisi", reason: "typo" }, admin),
    );
    expect(res.status).toBe(200);
    const { report } = await res.json();
    expect(report).toMatchObject({ tasks: ["tugas baru"], note: "revisi", submittedAt: 777, source: "staff" });

    const [entry] = await logs();
    expect(entry).toMatchObject({ action: "ubah", reason: "typo" });
    expect(entry.before).toMatchObject({ tasks: [`tugas ${FRIDAY}`], status: "aktif", submittedAt: 777 });
    expect(entry.after).toEqual({ tasks: ["tugas baru"], note: "revisi" });
  });

  it("menggantikan laporan Dibatalkan: kembali aktif, sumber admin, Waktu Keluar baru", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, FRIDAY, { status: "dibatalkan", at: 777 });
    const before = Date.now();
    const res = await save.POST(post({ staffId: budi.id, date: FRIDAY, tasks: ["pulih"], reason: "salah batal" }, admin));
    expect(res.status).toBe(200);
    const row = (await getDb().execute({ sql: "SELECT * FROM daily_report WHERE staff_id = ?", args: [budi.id] })).rows[0];
    expect(row.status).toBe("aktif");
    expect(row.source).toBe("admin");
    expect(Number(row.submitted_at)).toBeGreaterThanOrEqual(before);
    expect((await logs())[0].before).toMatchObject({ status: "dibatalkan" });
  });

  it("menolak tanggal yang ditandai Tidak Hadir dan tidak mencatat log", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertAbsence(budi.id, FRIDAY);
    const res = await save.POST(post({ staffId: budi.id, date: FRIDAY, tasks: ["a"], reason: "x" }, admin));
    expect(res.status).toBe(409);
    expect((await getDb().execute("SELECT COUNT(*) AS n FROM daily_report")).rows[0].n).toBe(0);
    expect(await logs()).toEqual([]);
  });

  it("validasi: alasan wajib, tugas wajib, Staff tidak ada", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    expect((await save.POST(post({ staffId: budi.id, date: FRIDAY, tasks: ["a"] }, admin))).status).toBe(400);
    expect((await save.POST(post({ staffId: budi.id, date: FRIDAY, tasks: ["a"], reason: " " }, admin))).status).toBe(400);
    expect((await save.POST(post({ staffId: budi.id, date: FRIDAY, tasks: [], reason: "x" }, admin))).status).toBe(400);
    expect((await save.POST(post({ staffId: 9999, date: FRIDAY, tasks: ["a"], reason: "x" }, admin))).status).toBe(404);
    expect(await logs()).toEqual([]);
  });
});

describe("POST /api/admin/report/cancel", () => {
  it("membatalkan laporan, mencatat log, dan Staff tidak bisa mengirim ulang", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, TODAY);

    expect((await cancel.POST(post({ staffId: budi.id, date: TODAY }, admin))).status).toBe(400);
    const res = await cancel.POST(post({ staffId: budi.id, date: TODAY, reason: "laporan keliru" }, admin));
    expect(res.status).toBe(200);

    const row = (await getDb().execute({ sql: "SELECT status FROM daily_report WHERE staff_id = ?", args: [budi.id] })).rows[0];
    expect(row.status).toBe("dibatalkan");
    const [entry] = await logs();
    expect(entry).toMatchObject({ type: "laporan", action: "batalkan", reason: "laporan keliru", after: { status: "dibatalkan" } });
    expect(entry.before).toMatchObject({ status: "aktif", tasks: [`tugas ${TODAY}`] });

    const resubmit = await submit.POST(
      new Request("https://staff.test/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: budi.cookie },
        body: JSON.stringify({ tasks: ["lagi"] }),
      }),
    );
    expect(resubmit.status).toBe(409);
  });

  it("404 bila tidak ada laporan aktif (termasuk yang sudah dibatalkan)", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, TODAY, { status: "dibatalkan" });
    expect((await cancel.POST(post({ staffId: budi.id, date: TODAY, reason: "x" }, admin))).status).toBe(404);
    expect((await cancel.POST(post({ staffId: budi.id, date: FRIDAY, reason: "x" }, admin))).status).toBe(404);
    expect(await logs()).toEqual([]);
  });
});

describe("GET /api/admin/export", () => {
  const url = (from: string, to: string) => `https://staff.test/api/admin/export?from=${from}&to=${to}`;

  it("berisi laporan aktif dan Tidak Hadir, tanpa laporan Dibatalkan", async () => {
    const admin = await adminCookie();
    const a = await seedStaff("andi@test.id");
    const b = await seedStaff("budi@test.id");
    const c = await seedStaff("cici@test.id");
    await insertReport(a.id, FRIDAY, { at: Date.UTC(2026, 10, 6, 8, 30, 0) });
    await insertReport(b.id, FRIDAY, { status: "dibatalkan" });
    await insertAbsence(c.id, FRIDAY, "Cuti", "liburan");

    const res = await exportCsv.GET(get(url(FRIDAY, FRIDAY), admin));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(`laporan-${FRIDAY}_${FRIDAY}.csv`);
    expect(res.headers.get("cache-control")).toBe("no-store");

    // Response.text() membuang BOM, jadi periksa byte mentahnya.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    const lines = text.trimEnd().split("\r\n");
    expect(lines[0]).toBe("Tanggal,Pengenal,Nama,Jabatan,Status,Waktu Keluar (WIB),Kategori Tidak Hadir,Tugas,Catatan");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("andi@test.id");
    expect(lines[1]).toContain("2026-11-06 15:30:00");
    expect(lines[2]).toContain("cici@test.id");
    expect(lines[2]).toContain("Tidak Hadir");
    expect(text).not.toContain("budi@test.id");
  });

  it("mengamankan sel dari injeksi rumus dan mengutip karakter khusus", async () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("baris1\nbaris2")).toBe('"baris1\nbaris2"');
    expect(csvCell("biasa")).toBe("biasa");

    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await getDb().execute({
      sql: `INSERT INTO daily_report (staff_id, report_date, tasks_json, note, submitted_at, source, status)
            VALUES (?, ?, ?, ?, 1, 'staff', 'aktif')`,
      args: [budi.id, FRIDAY, JSON.stringify(['=HYPERLINK("http://x")']), "+cmd"],
    });
    const text = await (await exportCsv.GET(get(url(FRIDAY, FRIDAY), admin))).text();
    // Sel tugas diawali "1. ", jadi bukan rumus dan tidak perlu apostrof; kutip tetap digandakan.
    expect(text).toContain(`"1. =HYPERLINK(""http://x"")"`);
    expect(text).toContain("'+cmd");
  });

  it("memvalidasi parameter rentang", async () => {
    const admin = await adminCookie();
    const call = (query: string) => exportCsv.GET(get(`https://staff.test/api/admin/export${query}`, admin));
    expect((await call("")).status).toBe(400);
    expect((await call(`?from=${FRIDAY}`)).status).toBe(400);
    expect((await call(`?from=${SATURDAY}&to=${FRIDAY}`)).status).toBe(400);
    expect((await call("?from=2026-13-01&to=2026-13-02")).status).toBe(400);
    expect((await call("?from=2025-01-01&to=2026-01-02")).status).toBe(400); // 367 hari
    expect((await call("?from=2025-01-01&to=2026-01-01")).status).toBe(200); // 366 hari
  });
});

describe("GET /api/admin/history", () => {
  it("menampilkan laporan Dibatalkan, tanda Tidak Hadir dengan catatan, dan paginasi per tanggal", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    await insertReport(budi.id, "2026-11-11");
    await insertReport(budi.id, "2026-11-10", { status: "dibatalkan" });
    await insertAbsence(budi.id, "2026-11-09", "Izin", "catatan internal");

    const body = await (await adminHistory.GET(get(`https://staff.test/api/admin/history?staffId=${budi.id}`, admin))).json();
    expect(body.staff.email).toBe("budi@test.id");
    expect(body.items.map((i: { date: string }) => i.date)).toEqual(["2026-11-11", "2026-11-10", "2026-11-09"]);
    expect(body.items[1].report.status).toBe("dibatalkan");
    expect(body.items[2].absence).toEqual({ category: "Izin", note: "catatan internal" });
    expect(body.nextBefore).toBeNull();
  });

  it("31 tanggal per halaman dengan kursor, menggabungkan dua sumber", async () => {
    const admin = await adminCookie();
    const budi = await seedStaff("budi@test.id");
    for (let i = 0; i < 40; i++) {
      const date = addDays("2026-01-01", i);
      if (i % 2 === 0) await insertReport(budi.id, date);
      else await insertAbsence(budi.id, date);
    }
    const base = `https://staff.test/api/admin/history?staffId=${budi.id}`;
    const first = await (await adminHistory.GET(get(base, admin))).json();
    expect(first.items).toHaveLength(31);
    expect(first.items[0].date).toBe(addDays("2026-01-01", 39));
    expect(first.nextBefore).toBe(first.items[30].date);
    const second = await (await adminHistory.GET(get(`${base}&before=${first.nextBefore}`, admin))).json();
    expect(second.items).toHaveLength(9);
    expect(second.nextBefore).toBeNull();
  });

  it("validasi staffId dan Staff tidak ada", async () => {
    const admin = await adminCookie();
    expect((await adminHistory.GET(get("https://staff.test/api/admin/history", admin))).status).toBe(400);
    expect((await adminHistory.GET(get("https://staff.test/api/admin/history?staffId=9999", admin))).status).toBe(404);
  });
});

describe("GET /api/reports/history (Staff) dengan Tidak Hadir", () => {
  it("menampilkan kategori Tidak Hadir milik sendiri tanpa catatan Admin", async () => {
    const budi = await seedStaff("budi@test.id");
    const sari = await seedStaff("sari@test.id");
    await insertReport(budi.id, "2026-11-11");
    await insertAbsence(budi.id, "2026-11-10", "Sakit", "catatan rahasia admin");
    await insertAbsence(sari.id, "2026-11-09", "Cuti");

    const res = await staffHistory.GET(get("https://staff.test/api/reports/history", budi.cookie));
    const text = await res.clone().text();
    expect(text).not.toContain("catatan rahasia admin");
    const body = await res.json();
    expect(body.absences).toEqual([{ date: "2026-11-10", category: "Sakit" }]);
    expect(body.items).toHaveLength(1);
  });

  it("tanda Tidak Hadir mengikuti halaman laporan, tidak muncul dobel", async () => {
    const budi = await seedStaff("budi@test.id");
    for (let i = 0; i < 40; i++) await insertReport(budi.id, addDays("2026-01-01", i));
    await insertAbsence(budi.id, addDays("2026-01-01", 45), "Izin"); // lebih baru dari semua laporan
    await insertAbsence(budi.id, addDays("2026-01-01", 2), "Cuti"); // di halaman kedua (laporan ke-3)
    const base = "https://staff.test/api/reports/history";

    const first = await (await staffHistory.GET(get(base, budi.cookie))).json();
    expect(first.absences.map((a: { date: string }) => a.date)).toEqual([addDays("2026-01-01", 45)]);
    const second = await (await staffHistory.GET(get(`${base}?before=${first.nextBefore}`, budi.cookie))).json();
    expect(second.absences.map((a: { date: string }) => a.date)).toEqual([addDays("2026-01-01", 2)]);
  });
});
