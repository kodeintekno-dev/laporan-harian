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
const login = await import("../_handlers/auth/login.js");
const me = await import("../_handlers/auth/me.js");
const list = await import("../_handlers/admin/staff/index.js");
const update = await import("../_handlers/admin/staff/update.js");
const resetPw = await import("../_handlers/admin/staff/reset-password.js");
const jabatanEndpoint = await import("../_handlers/admin/staff/jabatan.js");

const URL_ = "https://staff.test/api/admin/staff";

async function adminCookie(): Promise<string> {
  return sessionCookie(await signSession({ role: "admin", pv: adminFingerprint() })).split(";")[0];
}

function post(body: unknown, cookie?: string): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function get(cookie?: string): Request {
  return new Request(URL_, { headers: cookie ? { cookie } : {} });
}

/** Buat Staff aktif langsung di DB, kembalikan id dan cookie sesi. */
async function seedStaff(opts: {
  email?: string;
  phone?: string;
  status?: "menunggu" | "aktif" | "nonaktif" | "ditolak";
  googleSub?: string;
  withPassword?: boolean;
} = {}): Promise<{ id: number; cookie: string }> {
  const ep = 0;
  const email = opts.email ?? "budi@test.id";
  const phone = opts.phone ?? "+6281234567890";
  const status = opts.status ?? "aktif";
  const hash = opts.withPassword ? bcrypt.hashSync("password-cadangan-1", 4) : null;
  const result = await getDb().execute({
    sql: `INSERT INTO staff (google_sub, email, full_name, phone, status, password_hash, session_epoch, created_at)
          VALUES (?, ?, 'Budi Santoso', ?, ?, ?, ?, 1000) RETURNING id`,
    args: [opts.googleSub ?? null, email, phone, status, hash, ep],
  });
  const id = Number(result.rows[0].id);
  const token = await signSession({ role: "staff", staffId: id, ep });
  return { id, cookie: sessionCookie(token).split(";")[0] };
}

/** Buat Pendaftar (status menunggu) dengan google_sub tertentu. */
async function seedPendaftar(googleSub: string, phone = "+6289876543210"): Promise<{ id: number }> {
  const result = await getDb().execute({
    sql: `INSERT INTO staff (google_sub, email, full_name, phone, status, session_epoch, created_at)
          VALUES (?, 'pendaftar@test.id', 'Pendaftar Baru', ?, 'menunggu', 0, 2000) RETURNING id`,
    args: [googleSub, phone],
  });
  return { id: Number(result.rows[0].id) };
}

beforeAll(async () => {
  const sql1 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0001_init.sql"), "utf8");
  await getDb().executeMultiple(sql1);
  const sql2 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0002_google_sso.sql"), "utf8");
  await getDb().executeMultiple(sql2);
  const sql3 = await readFile(join(import.meta.dirname, "..", "..", "db", "migrations", "0003_jabatan.sql"), "utf8");
  await getDb().executeMultiple(sql3);
});

beforeEach(async () => {
  const db = getDb();
  await db.execute("DELETE FROM login_attempt");
  await db.execute("DELETE FROM daily_report");
  await db.execute("DELETE FROM absence");
  await db.execute("DELETE FROM staff");
});

describe("akses", () => {
  it("semua endpoint admin menolak tanpa login (401) dan Staff aktif (403)", async () => {
    const admin = await adminCookie();
    const { id, cookie: staffSession } = await seedStaff();

    for (const [fn, body] of [
      [list.GET, undefined],
      [list.POST, { id, action: "setujui" }],
      [update.POST, { id, status: "nonaktif" }],
      [resetPw.POST, { id }],
    ] as const) {
      const make = (c?: string) => (body === undefined ? get(c) : post(body, c));
      expect((await fn(make())).status).toBe(401);
      expect((await fn(make(staffSession))).status).toBe(403);
    }
  });
});

describe("GET /api/admin/staff", () => {
  it("menampilkan semua akun, urut status lalu nama", async () => {
    const admin = await adminCookie();
    await seedStaff({ email: "zaki@test.id", phone: "+6281111111111", status: "aktif" });
    await seedPendaftar("sub-pendaftar-1");
    await seedStaff({ email: "andi@test.id", phone: "+6282222222222", status: "nonaktif" });

    const body = await (await list.GET(get(admin))).json();
    const statuses = body.items.map((s: { status: string }) => s.status);
    expect(statuses[0]).toBe("menunggu");
    expect(statuses).toContain("aktif");
    expect(statuses).toContain("nonaktif");
  });

  it("password_hash tidak bocor ke respons", async () => {
    const admin = await adminCookie();
    await seedStaff({ withPassword: true });
    const text = await (await list.GET(get(admin))).text();
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("$2");
  });
});

describe("POST /api/admin/staff - setujui dan tolak", () => {
  it("setujui Pendaftar mengubah status menjadi aktif", async () => {
    const admin = await adminCookie();
    const { id } = await seedPendaftar("sub-setujui-1");

    const res = await list.POST(post({ id, action: "setujui" }, admin));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff.status).toBe("aktif");
    expect(body.staff.decidedAt).not.toBeNull();
  });

  it("tolak Pendaftar mengubah status menjadi ditolak, baris tetap ada", async () => {
    const admin = await adminCookie();
    const { id } = await seedPendaftar("sub-tolak-1");

    const res = await list.POST(post({ id, action: "tolak" }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff.status).toBe("ditolak");

    const row = (await getDb().execute({ sql: "SELECT status FROM staff WHERE id = ?", args: [id] })).rows[0];
    expect(row.status).toBe("ditolak");
  });

  it("setujui Staff yang bukan menunggu mengembalikan 404", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    expect((await list.POST(post({ id, action: "setujui" }, admin))).status).toBe(404);
  });

  it("id tidak ada mengembalikan 404", async () => {
    const admin = await adminCookie();
    expect((await list.POST(post({ id: 9999, action: "setujui" }, admin))).status).toBe(404);
  });
});

describe("POST /api/admin/staff - link (tautkan ke Staff yang ada)", () => {
  it("memindahkan google_sub dari Pendaftar ke Staff lama, Pendaftar dihapus", async () => {
    const admin = await adminCookie();
    const { id: staffId } = await seedStaff({ googleSub: "sub-lama" });
    const { id: pendaftarId } = await seedPendaftar("sub-baru", "+6283333333333");

    const res = await list.POST(post({ action: "link", pendaftarId, staffId }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff.id).toBe(staffId);

    const pRow = (await getDb().execute({ sql: "SELECT id FROM staff WHERE id = ?", args: [pendaftarId] })).rows[0];
    expect(pRow).toBeUndefined();

    const sRow = (await getDb().execute({ sql: "SELECT google_sub FROM staff WHERE id = ?", args: [staffId] })).rows[0];
    expect(sRow.google_sub).toBe("sub-baru");
  });

  it("menolak jika Pendaftar bukan berstatus menunggu", async () => {
    const admin = await adminCookie();
    const { id: staffId } = await seedStaff({ email: "a@test.id", phone: "+6281111111111" });
    const { id: pendaftarId } = await seedStaff({ email: "b@test.id", phone: "+6282222222222", status: "aktif" });

    expect((await list.POST(post({ action: "link", pendaftarId, staffId }, admin))).status).toBe(404);
  });
});

describe("POST /api/admin/staff/update", () => {
  it("mengubah nama lengkap tanpa menyentuh status", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    const res = await update.POST(post({ id, fullName: "Budi Baru" }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff).toMatchObject({ fullName: "Budi Baru", status: "aktif" });
  });

  it("mengubah Display Name dan mengosongkannya kembali", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();

    const setBody = await (await update.POST(post({ id, displayName: "Budi Keren" }, admin))).json();
    expect(setBody.staff.displayName).toBe("Budi Keren");
    expect(setBody.staff.identifier).toBe("Budi Keren");

    const clearBody = await (await update.POST(post({ id, displayName: null }, admin))).json();
    expect(clearBody.staff.displayName).toBeNull();
    expect(clearBody.staff.identifier).toBe("budi@test.id");
  });

  it("menonaktifkan menaikkan session_epoch dan mematikan sesi yang berjalan", async () => {
    const admin = await adminCookie();
    const { id, cookie } = await seedStaff();
    const meReq = () => new Request("https://staff.test/api/auth/me", { headers: { cookie } });
    expect((await me.GET(meReq())).status).toBe(200);

    await update.POST(post({ id, status: "nonaktif" }, admin));
    expect((await me.GET(meReq())).status).toBe(401);
  });

  it("mengaktifkan kembali mengubah status menjadi aktif", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    await update.POST(post({ id, status: "nonaktif" }, admin));
    const res = await update.POST(post({ id, status: "aktif" }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff.status).toBe("aktif");
  });

  it("404 untuk id tidak ada, 400 bila tidak ada yang diubah", async () => {
    const admin = await adminCookie();
    expect((await update.POST(post({ id: 9999, status: "nonaktif" }, admin))).status).toBe(404);
    const { id } = await seedStaff();
    expect((await update.POST(post({ id }, admin))).status).toBe(400);
  });
});

describe("POST /api/admin/staff/reset-password (Hapus Password Cadangan)", () => {
  it("menghapus password_hash, menaikkan session_epoch, dan mematikan sesi lama", async () => {
    const admin = await adminCookie();
    const { id, cookie } = await seedStaff({ withPassword: true });
    const meReq = () => new Request("https://staff.test/api/auth/me", { headers: { cookie } });
    expect((await me.GET(meReq())).status).toBe(200);

    const res = await resetPw.POST(post({ id }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff.hasBackupPassword).toBe(false);

    expect((await me.GET(meReq())).status).toBe(401);

    const row = (await getDb().execute({ sql: "SELECT password_hash FROM staff WHERE id = ?", args: [id] })).rows[0];
    expect(row.password_hash).toBeNull();
  });

  it("menghapus kunci login nomor telepon yang sedang aktif", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff({ withPassword: true });

    await getDb().execute({
      sql: "INSERT INTO login_attempt (key, fail_count, locked_until, last_fail_at) VALUES (?, 5, 9999999999999, 1)",
      args: ["login|+6281234567890|10.0.0.1"],
    });

    await resetPw.POST(post({ id }, admin));

    const row = (await getDb().execute({
      sql: "SELECT * FROM login_attempt WHERE key LIKE 'login|+6281234567890|%'",
    })).rows[0];
    expect(row).toBeUndefined();
  });

  it("404 untuk id tidak ada", async () => {
    expect((await resetPw.POST(post({ id: 9999 }, await adminCookie()))).status).toBe(404);
  });
});

describe("login nomor telepon setelah disetujui", () => {
  it("Staff aktif dengan Password Cadangan bisa login", async () => {
    await seedStaff({ withPassword: true });

    const res = await login.POST(
      new Request("https://staff.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "10.0.0.1" },
        body: JSON.stringify({ phone: "+6281234567890", password: "password-cadangan-1", mode: "staff" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "staff", fullName: "Budi Santoso" });
  });
});

describe("POST /api/admin/staff/jabatan", () => {
  const JABATAN_URL = "https://staff.test/api/admin/staff/jabatan";
  function jabatanPost(body: unknown, cookie?: string): Request {
    return new Request(JABATAN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  }

  it("menolak tanpa login (401) dan Staff aktif (403)", async () => {
    const admin = await adminCookie();
    const { id, cookie: staffSession } = await seedStaff();
    expect((await jabatanEndpoint.POST(jabatanPost({ id, jabatan: [] }))).status).toBe(401);
    expect((await jabatanEndpoint.POST(jabatanPost({ id, jabatan: [] }, staffSession))).status).toBe(403);
  });

  it("menetapkan jabatan baru dan mengembalikan StaffView dengan jabatan", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    const res = await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Tim IT", "Kabid IT"] }, admin));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff.jabatan).toEqual(expect.arrayContaining(["Tim IT", "Kabid IT"]));
    expect(body.staff.jabatan).toHaveLength(2);
  });

  it("mengganti jabatan lama sepenuhnya", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Tim IT"] }, admin));
    const res = await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Tim Diknas (Mentor)", "Tim Kesiswaan (Musyrif)"] }, admin));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff.jabatan).not.toContain("Tim IT");
    expect(body.staff.jabatan).toHaveLength(2);
  });

  it("mengosongkan jabatan (array kosong)", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Tim IT"] }, admin));
    const res = await jabatanEndpoint.POST(jabatanPost({ id, jabatan: [] }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).staff.jabatan).toHaveLength(0);
  });

  it("menolak lebih dari 3 jabatan (400)", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    const res = await jabatanEndpoint.POST(
      jabatanPost({ id, jabatan: ["Tim IT", "Tim Diknas (Mentor)", "Tim Kesiswaan (Musyrif)", "Tim Sarpras"] }, admin),
    );
    expect(res.status).toBe(400);
  });

  it("menolak jabatan tidak valid (400)", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    const res = await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Jabatan Tidak Ada"] }, admin));
    expect(res.status).toBe(400);
  });

  it("404 untuk id Staff tidak ada", async () => {
    const admin = await adminCookie();
    const res = await jabatanEndpoint.POST(jabatanPost({ id: 9999, jabatan: ["Tim IT"] }, admin));
    expect(res.status).toBe(404);
  });

  it("GET /api/admin/staff menyertakan jabatan di setiap item", async () => {
    const admin = await adminCookie();
    const { id } = await seedStaff();
    await jabatanEndpoint.POST(jabatanPost({ id, jabatan: ["Kepala Sekolah"] }, admin));
    const body = await (await list.GET(get(admin))).json();
    const found = body.items.find((s: { id: number }) => s.id === id);
    expect(found?.jabatan).toEqual(["Kepala Sekolah"]);
  });
});
