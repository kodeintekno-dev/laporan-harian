import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const ADMIN_PASSWORD = "password-admin-panjang";
const STAFF_PHONE = "+6281234567890";
const STAFF_PASSWORD = "password-staff-cadangan-1";

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.SESSION_SECRET = "x".repeat(48);
process.env.ADMIN_USERNAME = "kepala";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 4);

const { getDb } = await import("../_lib/db.js");
const { default: api } = await import("../[...path].js");
const login = await import("../_handlers/auth/login.js");
const me = await import("../_handlers/auth/me.js");
const changePassword = await import("../_handlers/auth/change-password.js");
const logout = await import("../_handlers/auth/logout.js");
const { lockDurationMs } = await import("../_lib/throttle.js");

function post(body: unknown, cookie?: string, ip = "10.0.0.1"): Request {
  return new Request("https://staff.test/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function get(cookie?: string): Request {
  return new Request("https://staff.test/api/auth/me", { headers: cookie ? { cookie } : {} });
}

/** Ambil pasangan "session=..." dari header Set-Cookie. */
function cookieOf(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0];
}

/**
 * Buat Staff aktif dengan Password Cadangan. Nomor telepon bisa dioverride untuk tes kunci login.
 * session_epoch = 0 supaya token yang dibuat langsung cocok.
 */
async function seedStaff(opts: { phone?: string; status?: string; withPassword?: boolean } = {}): Promise<number> {
  const phone = opts.phone ?? STAFF_PHONE;
  const status = opts.status ?? "aktif";
  const hash = opts.withPassword !== false ? bcrypt.hashSync(STAFF_PASSWORD, 4) : null;
  const result = await getDb().execute({
    sql: `INSERT INTO staff (email, full_name, phone, status, password_hash, session_epoch, created_at)
          VALUES ('budi@test.id', 'Budi Santoso', ?, ?, ?, 0, 1000) RETURNING id`,
    args: [phone, status, hash],
  });
  return Number(result.rows[0].id);
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
  await db.execute("DELETE FROM staff");
});

describe("lockDurationMs", () => {
  it("4 percobaan pertama bebas, lalu 1, 2, 4, ... menit, maksimal 60", () => {
    expect([1, 2, 3, 4].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8].map((n) => lockDurationMs(n) / 60_000)).toEqual([1, 2, 4, 8]);
    expect(lockDurationMs(10) / 60_000).toBe(32);
    expect(lockDurationMs(11) / 60_000).toBe(60);
    expect(lockDurationMs(40) / 60_000).toBe(60);
  });
});

describe("login", () => {
  it("staff berhasil login dengan nomor telepon dan mendapat cookie HttpOnly", async () => {
    await seedStaff();
    const res = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ role: "staff", fullName: "Budi Santoso" });
  });

  it("nomor telepon dinormalisasi: 081234567890 sama dengan +6281234567890", async () => {
    await seedStaff();
    const res = await login.POST(post({ phone: "081234567890", password: STAFF_PASSWORD, mode: "staff" }));
    expect(res.status).toBe(200);
  });

  it("password salah dan nomor tidak ada memberi pesan yang sama", async () => {
    await seedStaff();
    const wrongPassword = await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }));
    const noUser = await login.POST(post({ phone: "+6289999999999", password: "salah-salah", mode: "staff" }));
    expect(wrongPassword.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await noUser.json());
  });

  it("staff tanpa Password Cadangan ditolak dengan pesan yang sama", async () => {
    await seedStaff({ withPassword: false });
    const res = await login.POST(post({ phone: STAFF_PHONE, password: "apa-saja", mode: "staff" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Nomor telepon atau password salah.");
  });

  it("akun nonaktif ditolak dengan pesan yang sama", async () => {
    await seedStaff({ status: "nonaktif" });
    const res = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Nomor telepon atau password salah.");
  });

  it("admin dari env bisa login", async () => {
    const res = await login.POST(post({ username: "kepala", password: ADMIN_PASSWORD, mode: "admin" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "admin" });
  });

  it("menolak body yang bukan JSON", async () => {
    const res = await login.POST(
      new Request("https://staff.test/api", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "phone=081234567890",
      }),
    );
    expect(res.status).toBe(415);
  });

  it("kegagalan ke-5 mengunci, dan password benar pun ditolak selama terkunci", async () => {
    await seedStaff();
    for (let i = 0; i < 4; i++) {
      const res = await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }));
      expect(res.status).toBe(401);
    }
    const fifth = await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }));
    expect(fifth.status).toBe(429);

    const correct = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }));
    expect(correct.status).toBe(429);
  });

  it("kunci per nomor+IP: IP lain tidak ikut terkunci", async () => {
    await seedStaff();
    for (let i = 0; i < 5; i++) {
      await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }, undefined, "10.0.0.1"));
    }
    const otherIp = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }, undefined, "10.0.0.2"));
    expect(otherIp.status).toBe(200);
  });

  it("login berhasil mereset hitungan gagal", async () => {
    await seedStaff();
    for (let i = 0; i < 4; i++) {
      await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }));
    }
    const ok = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }));
    expect(ok.status).toBe(200);
    const again = await login.POST(post({ phone: STAFF_PHONE, password: "salah-salah", mode: "staff" }));
    expect(again.status).toBe(401);
  });
});

describe("sesi", () => {
  async function staffCookie(): Promise<string> {
    const res = await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }));
    return cookieOf(res);
  }

  it("tanpa cookie ditolak", async () => {
    expect((await me.GET(get())).status).toBe(401);
  });

  it("Web Handler merutekan login dan memeriksa cookie sesi", async () => {
    await seedStaff();

    expect((await api.fetch(get())).status).toBe(401);

    const loginResponse = await api.fetch(new Request("https://staff.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" }),
    }));
    expect(loginResponse.status).toBe(200);

    const res = await api.fetch(get(cookieOf(loginResponse)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "staff", fullName: "Budi Santoso" });
  });

  it("Web Handler mengembalikan 405 untuk HEAD pada endpoint sesi", async () => {
    const res = await api.fetch(new Request("https://staff.test/api/auth/me", { method: "HEAD" }));
    expect(res.status).toBe(405);
  });

  it("token palsu ditolak", async () => {
    expect((await me.GET(get("session=bukan.token.valid"))).status).toBe(401);
  });

  it("menonaktifkan akun (session_epoch naik) langsung mematikan sesi yang sudah ada", async () => {
    const id = await seedStaff();
    const cookie = await staffCookie();
    expect((await me.GET(get(cookie))).status).toBe(200);

    await getDb().execute({ sql: "UPDATE staff SET status = 'nonaktif', session_epoch = session_epoch + 1 WHERE id = ?", args: [id] });
    expect((await me.GET(get(cookie))).status).toBe(401);
  });

  it("menaikkan session_epoch (hapus Password Cadangan) mematikan sesi lama", async () => {
    const id = await seedStaff();
    const cookie = await staffCookie();
    expect((await me.GET(get(cookie))).status).toBe(200);

    await getDb().execute({ sql: "UPDATE staff SET session_epoch = session_epoch + 1 WHERE id = ?", args: [id] });
    expect((await me.GET(get(cookie))).status).toBe(401);
  });

  it("mengganti ADMIN_PASSWORD_HASH mematikan sesi admin lama", async () => {
    const res = await login.POST(post({ username: "kepala", password: ADMIN_PASSWORD, mode: "admin" }));
    const cookie = cookieOf(res);
    expect((await me.GET(get(cookie))).status).toBe(200);

    const original = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("password-admin-baru", 4);
    try {
      expect((await me.GET(get(cookie))).status).toBe(401);
    } finally {
      process.env.ADMIN_PASSWORD_HASH = original;
    }
  });

  it("logout menghapus cookie", async () => {
    const res = await logout.POST();
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("Password Cadangan", () => {
  it("membuat pertama kali tanpa currentPassword, sesi baru diterbitkan, sesi lama mati", async () => {
    // Staff tanpa Password Cadangan: login lewat Google (simulasi dengan token langsung)
    const { signSession, sessionCookie } = await import("../_lib/session.js");
    const id = await seedStaff({ withPassword: false });
    const oldCookie = sessionCookie(await signSession({ role: "staff", staffId: id, ep: 0 })).split(";")[0];

    const res = await changePassword.POST(post({ newPassword: "password-baru-9" }, oldCookie));
    expect(res.status).toBe(200);
    const newCookie = cookieOf(res);

    expect((await me.GET(get(oldCookie))).status).toBe(401);
    expect((await me.GET(get(newCookie))).status).toBe(200);

    // Sekarang bisa login dengan nomor telepon
    const relogin = await login.POST(post({ phone: STAFF_PHONE, password: "password-baru-9", mode: "staff" }));
    expect(relogin.status).toBe(200);
  });

  it("mengubah yang sudah ada: currentPassword wajib, sesi lama mati", async () => {
    await seedStaff();
    const oldCookie = cookieOf(await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" })));

    const res = await changePassword.POST(
      post({ currentPassword: STAFF_PASSWORD, newPassword: "password-baru-9" }, oldCookie),
    );
    expect(res.status).toBe(200);
    const newCookie = cookieOf(res);

    expect((await me.GET(get(oldCookie))).status).toBe(401);
    expect((await me.GET(get(newCookie))).status).toBe(200);

    const relogin = await login.POST(post({ phone: STAFF_PHONE, password: "password-baru-9", mode: "staff" }));
    expect(relogin.status).toBe(200);
  });

  it("menolak password saat ini yang salah, password pendek, dan password yang sama", async () => {
    await seedStaff();
    const cookie = cookieOf(await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" })));

    const wrong = await changePassword.POST(post({ currentPassword: "salah-salah", newPassword: "password-baru-9" }, cookie));
    expect(wrong.status).toBe(400);

    const short = await changePassword.POST(post({ currentPassword: STAFF_PASSWORD, newPassword: "pendek" }, cookie));
    expect(short.status).toBe(400);

    const same = await changePassword.POST(post({ currentPassword: STAFF_PASSWORD, newPassword: STAFF_PASSWORD }, cookie));
    expect(same.status).toBe(400);
  });

  it("admin tidak bisa ganti password lewat aplikasi", async () => {
    const cookie = cookieOf(await login.POST(post({ username: "kepala", password: ADMIN_PASSWORD, mode: "admin" })));
    const res = await changePassword.POST(post({ currentPassword: ADMIN_PASSWORD, newPassword: "password-baru-9" }, cookie));
    expect(res.status).toBe(403);
  });

  it("menebak password saat ini dengan sesi curian akhirnya dikunci", async () => {
    await seedStaff();
    const cookie = cookieOf(await login.POST(post({ phone: STAFF_PHONE, password: STAFF_PASSWORD, mode: "staff" })));
    for (let i = 0; i < 5; i++) {
      await changePassword.POST(post({ currentPassword: "tebakan-salah", newPassword: "password-baru-9" }, cookie));
    }
    const res = await changePassword.POST(post({ currentPassword: STAFF_PASSWORD, newPassword: "password-baru-9" }, cookie));
    expect(res.status).toBe(429);
  });
});
