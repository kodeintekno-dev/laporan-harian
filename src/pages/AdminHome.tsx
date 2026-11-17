import { useCallback, useEffect, useState } from "react";
import { api, ApiError, JABATAN_LIST, type Me, type StaffRow } from "../api";
import { formatDate } from "../format";
import { StaffHome } from "./StaffHome";
import { AdminRecap } from "./AdminRecap";

const STATUS_LABEL: Record<StaffRow["status"], string> = {
  menunggu: "Menunggu Persetujuan",
  aktif: "Aktif",
  ditolak: "Ditolak",
  nonaktif: "Nonaktif",
};

export function AdminHome({ onLogout, superadmin, account, onChangePassword }: {
  onLogout: () => void;
  superadmin: boolean;
  account?: Extract<Me, { role: "staff" }>;
  onChangePassword: () => void;
}) {
  const [items, setItems] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<"rekap" | "staff" | "laporan">("rekap");
  const [roleEditor, setRoleEditor] = useState<StaffRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ pendaftar: StaffRow; staff: StaffRow } | null>(null);
  const [jabatanEditId, setJabatanEditId] = useState<number | null>(null);
  const [jabatanDraft, setJabatanDraft] = useState<string[]>([]);

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

  const load = useCallback(async () => {
    try {
      setItems((await api.staffList()).items);
    } catch (e) {
      handle(e);
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(staff: StaffRow, action: "setujui" | "tolak") {
    const label = action === "setujui" ? "menyetujui" : "menolak";
    if (!window.confirm(`Yakin ingin ${label} ${staff.fullName}?`)) return;
    await run(staff.id, async () => {
      await api.staffDecide(staff.id, action);
    });
  }

  async function toggleActive(staff: StaffRow) {
    const action = staff.status === "aktif" ? "menonaktifkan" : "mengaktifkan";
    if (!window.confirm(`Yakin ingin ${action} akun ${staff.fullName}?`)) return;
    await run(staff.id, async () => {
      await api.staffUpdate(staff.id, { status: staff.status === "aktif" ? "nonaktif" : "aktif" });
    });
  }

  async function resetPassword(staff: StaffRow) {
    if (!window.confirm(`Hapus Password Cadangan ${staff.fullName}? Sesi login yang sedang berjalan akan berakhir.`)) return;
    await run(staff.id, async () => {
      await api.staffResetPassword(staff.id);
    });
  }

  function openJabatanEdit(staff: StaffRow) {
    setJabatanEditId(staff.id);
    setJabatanDraft([...staff.jabatan]);
  }

  function toggleJabatan(nama: string) {
    setJabatanDraft((prev) =>
      prev.includes(nama) ? prev.filter((j) => j !== nama) : prev.length < 3 ? [...prev, nama] : prev,
    );
  }

  async function saveJabatan(staffId: number) {
    await run(staffId, async () => {
      await api.staffSetJabatan(staffId, jabatanDraft);
    });
    setJabatanEditId(null);
  }

  async function rename(staff: StaffRow) {
    const name = window.prompt("Nama lengkap baru:", staff.fullName);
    if (name === null || name.trim() === "" || name.trim() === staff.fullName) return;
    await run(staff.id, async () => {
      await api.staffUpdate(staff.id, { fullName: name });
    });
  }

  async function run(id: number, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      handle(e);
    } finally {
      setBusyId(null);
    }
  }

  const showPersonalReport = account && !account.reportingExempt;
  const currentTab = tab === "laporan" && !showPersonalReport ? "rekap" : tab;
  const pendaftarList = items?.filter((s) => s.status === "menunggu") ?? [];
  const activeList = items?.filter((s) => s.status === "aktif" || s.status === "nonaktif") ?? [];
  const rejectedList = items?.filter((s) => s.status === "ditolak") ?? [];

  return (
    <main className="card wide">
      <header className="top">
        <div>
          <h1>{superadmin ? "Panel Superadmin" : "Panel Admin"}</h1>
          <p className="muted">Rekap laporan dan kelola akun Staff.</p>
        </div>
        {account && <button type="button" className="secondary" onClick={onChangePassword}>
          {account.hasBackupPassword ? "Ubah Password Cadangan" : "Buat Password Cadangan"}
        </button>}
        <button type="button" className="secondary" onClick={onLogout}>
          Keluar
        </button>
      </header>

      <div className="tabs" role="group" aria-label="Bagian panel">
        {showPersonalReport && <button type="button" aria-pressed={currentTab === "laporan"} onClick={() => setTab("laporan")}>
          Laporan Saya
        </button>}
        <button type="button" aria-pressed={currentTab === "rekap"} onClick={() => setTab("rekap")}>
          Pantauan Tim
        </button>
        <button type="button" aria-pressed={tab === "staff"} onClick={() => setTab("staff")}>
          Staff
          {pendaftarList.length > 0 && <span className="badge-count">{pendaftarList.length}</span>}
        </button>
      </div>

      {currentTab === "rekap" && <AdminRecap onLogout={onLogout} />}
      {currentTab === "laporan" && showPersonalReport && (
        <StaffHome me={account} onChangePassword={onChangePassword} onLogout={onLogout} embedded />
      )}

      {tab === "staff" && (
        <>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          {message && <p className="notice" role="status">{message}</p>}
          <button type="button" className="secondary" onClick={() => setCreating(!creating)}>
            {creating ? "Tutup formulir akun" : "Buat akun Staff"}
          </button>
          {creating && <form onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run(0, async () => {
              await api.staffCreate(String(data.get("name")), String(data.get("phone")), String(data.get("password")));
              setCreating(false);
              setMessage("Akun Staff aktif telah dibuat.");
            });
          }}>
            <label>Nama lengkap <input name="name" required maxLength={100} /></label>
            <label>Nomor telepon <input name="phone" type="tel" required /></label>
            <p className="muted">Pemilik akun perlu mengganti password awal sebelum dapat dipromosikan.</p>
            <label>Password awal <input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button type="submit" disabled={busyId !== null}>Buat akun</button>
          </form>}
          {superadmin && roleEditor && <form className="notice" onSubmit={(event) => {
            event.preventDefault();
            void run(roleEditor.id, async () => {
              const { effectiveDate } = await api.staffSetRole(roleEditor.id, roleEditor.isAdmin, roleEditor.monitoringOnly);
              setRoleEditor(null);
              setMessage(`Peran diperbarui. Pengaturan laporan berlaku mulai ${formatDate(effectiveDate)} WIB.`);
            });
          }}>
            <h2>Peran {roleEditor.fullName}</h2>
            <label>
              Peran
              <select value={roleEditor.isAdmin ? "admin" : "staff"} onChange={(event) => {
                const isAdmin = event.target.value === "admin";
                setRoleEditor({ ...roleEditor, isAdmin, monitoringOnly: isAdmin && roleEditor.monitoringOnly });
              }}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {roleEditor.isAdmin && <label className="jabatan-check-item">
              <input type="checkbox" checked={roleEditor.monitoringOnly} onChange={(event) =>
                setRoleEditor({ ...roleEditor, monitoringOnly: event.target.checked })} />
              Monitoring only (bebas laporan mulai besok)
            </label>}
            <button type="submit" disabled={busyId !== null}>Simpan peran</button>
            <button type="button" className="secondary" onClick={() => setRoleEditor(null)}>Batal</button>
          </form>}

          {linkTarget && (
            <section className="notice" role="status">
              <h2>Tautkan {linkTarget.pendaftar.fullName} ke Staff yang sudah ada?</h2>
              <p>
                Akun Google <code>{linkTarget.pendaftar.email}</code> akan ditautkan ke{" "}
                <strong>{linkTarget.staff.fullName}</strong> ({linkTarget.staff.identifier}). Akun Pendaftar akan dihapus.
              </p>
              <div className="row tight">
                <button
                  type="button"
                  disabled={busyId === linkTarget.pendaftar.id}
                  onClick={async () => {
                    await run(linkTarget.pendaftar.id, async () => {
                      await api.staffLink(linkTarget.pendaftar.id, linkTarget.staff.id);
                    });
                    setLinkTarget(null);
                  }}
                >
                  Ya, tautkan
                </button>
                <button type="button" className="secondary" onClick={() => setLinkTarget(null)}>
                  Batal
                </button>
              </div>
            </section>
          )}

          <section aria-labelledby="pendaftar-title">
            <h2 id="pendaftar-title">Pendaftar menunggu persetujuan</h2>
            {!items && !error && <p className="muted">Memuat…</p>}
            {items && pendaftarList.length === 0 && <p className="muted">Tidak ada Pendaftar yang menunggu.</p>}
            {pendaftarList.length > 0 && (
              <ul className="staff-list">
                {pendaftarList.map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.fullName}</strong>
                      <div className="muted">
                        {s.email} · {s.phone}
                      </div>
                    </div>
                    <div className="row tight">
                      <button type="button" disabled={busyId === s.id} onClick={() => decide(s, "setujui")}>
                        Setujui
                      </button>
                      <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => decide(s, "tolak")}>
                        Tolak
                      </button>
                      {activeList.length > 0 && (
                        <select
                          value=""
                          disabled={busyId === s.id}
                          onChange={(e) => {
                            const target = activeList.find((a) => a.id === Number(e.target.value));
                            if (target) setLinkTarget({ pendaftar: s, staff: target });
                          }}
                          aria-label={`Tautkan ${s.fullName} ke Staff yang sudah ada`}
                        >
                          <option value="">Tautkan ke…</option>
                          {activeList.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.fullName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="staff-title">
            <h2 id="staff-title">Daftar Staff</h2>
            {items && activeList.length === 0 && <p className="muted">Belum ada Staff aktif.</p>}
            {activeList.length > 0 && (
              <ul className="staff-list">
                {activeList.map((s) => (
                  <li key={s.id} className={s.status === "nonaktif" ? "inactive" : ""}>
                    <div>
                      <strong>{s.fullName}</strong>
                      <div className="muted">
                        {s.identifier}
                        {s.status === "nonaktif" && " · Nonaktif"}
                        {!s.hasGoogleLinked && " · Google belum tertaut"}
                        {s.hasBackupPassword && " · Punya Password Cadangan"}
                      </div>
                      {s.jabatan.length > 0 && (
                        <div className="jabatan-tags">
                          {s.jabatan.map((j) => (
                            <span key={j} className="jabatan-tag">
                              {j}
                            </span>
                          ))}
                        </div>
                      )}
                      {jabatanEditId === s.id && (
                        <div className="jabatan-edit">
                          <p className="muted small">Pilih maks. 3 jabatan:</p>
                          <div className="jabatan-checklist">
                            {JABATAN_LIST.map((nama) => (
                              <label key={nama} className="jabatan-check-item">
                                <input
                                  type="checkbox"
                                  checked={jabatanDraft.includes(nama)}
                                  disabled={!jabatanDraft.includes(nama) && jabatanDraft.length >= 3}
                                  onChange={() => toggleJabatan(nama)}
                                />
                                {nama}
                              </label>
                            ))}
                          </div>
                          <div className="row tight">
                            <button type="button" disabled={busyId === s.id} onClick={() => saveJabatan(s.id)}>
                              Simpan jabatan
                            </button>
                            <button type="button" className="secondary" onClick={() => setJabatanEditId(null)}>
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="row tight">
                      {superadmin && <button type="button" className="secondary" disabled={busyId === s.id}
                        onClick={() => setRoleEditor(s)}>
                        {s.isAdmin ? (s.monitoringOnly ? "Admin · Monitoring only" : "Admin · Ubah peran") : "Ubah peran"}
                      </button>}
                      {s.hasGoogleLinked && s.hasBackupPassword && <button type="button" className="secondary" disabled={busyId === s.id}
                        onClick={() => {
                          if (window.confirm(`Lepas tautan Google untuk ${s.fullName}?`)) {
                            void run(s.id, async () => { await api.staffUnlinkGoogle(s.id); });
                          }
                        }}>
                        Lepas tautan Google
                      </button>}
                      <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => rename(s)}>
                        Ubah nama
                      </button>
                      <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => openJabatanEdit(s)}>
                        Jabatan
                      </button>
                      {s.hasBackupPassword && (
                        <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => resetPassword(s)}>
                          Hapus Password Cadangan
                        </button>
                      )}
                      <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => toggleActive(s)}>
                        {s.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {rejectedList.length > 0 && (
            <section aria-labelledby="rejected-title">
              <h2 id="rejected-title">Ditolak</h2>
              <ul className="staff-list">
                {rejectedList.map((s) => (
                  <li key={s.id} className="inactive">
                    <div>
                      <strong>{s.fullName}</strong>
                      <div className="muted">
                        {s.email} · {s.phone}
                      </div>
                    </div>
                    <div className="row tight">
                      <button type="button" className="secondary" disabled={busyId === s.id} onClick={() => decide(s, "setujui")}>
                        Setujui
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
