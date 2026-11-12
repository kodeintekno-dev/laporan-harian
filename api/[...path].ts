/**
 * Router catch-all — satu Serverless Function untuk semua endpoint /api/*.
 * Diperlukan agar tidak melebihi batas 12 functions di Vercel Hobby plan.
 */

import * as adminAbsenceMark from "./_handlers/admin/absence/mark.js";
import * as adminAbsenceRevoke from "./_handlers/admin/absence/revoke.js";
import * as adminExport from "./_handlers/admin/export.js";
import * as adminHistory from "./_handlers/admin/history.js";
import * as adminRecap from "./_handlers/admin/recap.js";
import * as adminReportCancel from "./_handlers/admin/report/cancel.js";
import * as adminReportSave from "./_handlers/admin/report/save.js";
import * as adminStaff from "./_handlers/admin/staff/index.js";
import * as adminStaffJabatan from "./_handlers/admin/staff/jabatan.js";
import * as adminStaffResetPassword from "./_handlers/admin/staff/reset-password.js";
import * as adminStaffUnlinkGoogle from "./_handlers/admin/staff/unlink-google.js";
import * as adminStaffUpdate from "./_handlers/admin/staff/update.js";
import * as authChangePassword from "./_handlers/auth/change-password.js";
import * as authGoogleCallback from "./_handlers/auth/google/callback.js";
import * as authGoogle from "./_handlers/auth/google/index.js";
import * as authLogin from "./_handlers/auth/login.js";
import * as authLogout from "./_handlers/auth/logout.js";
import * as authMe from "./_handlers/auth/me.js";
import * as authRegister from "./_handlers/auth/register.js";
import * as health from "./_handlers/health.js";
import * as reportsHistory from "./_handlers/reports/history.js";
import * as reportsIndex from "./_handlers/reports/index.js";
import * as reportsToday from "./_handlers/reports/today.js";
import { json } from "./_lib/http.js";

type Handler = (req: Request) => Promise<Response>;
type Module = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

const routes: Array<{ pattern: URLPattern; module: Module }> = [
  { pattern: new URLPattern({ pathname: "/api/health" }), module: health },
  { pattern: new URLPattern({ pathname: "/api/auth/login" }), module: authLogin },
  { pattern: new URLPattern({ pathname: "/api/auth/logout" }), module: authLogout },
  { pattern: new URLPattern({ pathname: "/api/auth/me" }), module: authMe },
  { pattern: new URLPattern({ pathname: "/api/auth/register" }), module: authRegister },
  { pattern: new URLPattern({ pathname: "/api/auth/change-password" }), module: authChangePassword },
  { pattern: new URLPattern({ pathname: "/api/auth/google" }), module: authGoogle },
  { pattern: new URLPattern({ pathname: "/api/auth/google/callback" }), module: authGoogleCallback },
  { pattern: new URLPattern({ pathname: "/api/reports" }), module: reportsIndex },
  { pattern: new URLPattern({ pathname: "/api/reports/history" }), module: reportsHistory },
  { pattern: new URLPattern({ pathname: "/api/reports/today" }), module: reportsToday },
  { pattern: new URLPattern({ pathname: "/api/admin/recap" }), module: adminRecap },
  { pattern: new URLPattern({ pathname: "/api/admin/history" }), module: adminHistory },
  { pattern: new URLPattern({ pathname: "/api/admin/export" }), module: adminExport },
  { pattern: new URLPattern({ pathname: "/api/admin/absence/mark" }), module: adminAbsenceMark },
  { pattern: new URLPattern({ pathname: "/api/admin/absence/revoke" }), module: adminAbsenceRevoke },
  { pattern: new URLPattern({ pathname: "/api/admin/report/cancel" }), module: adminReportCancel },
  { pattern: new URLPattern({ pathname: "/api/admin/report/save" }), module: adminReportSave },
  { pattern: new URLPattern({ pathname: "/api/admin/staff" }), module: adminStaff },
  { pattern: new URLPattern({ pathname: "/api/admin/staff/jabatan" }), module: adminStaffJabatan },
  { pattern: new URLPattern({ pathname: "/api/admin/staff/reset-password" }), module: adminStaffResetPassword },
  { pattern: new URLPattern({ pathname: "/api/admin/staff/unlink-google" }), module: adminStaffUnlinkGoogle },
  { pattern: new URLPattern({ pathname: "/api/admin/staff/update" }), module: adminStaffUpdate },
];

export default async function handler(request: Request): Promise<Response> {
  const method = request.method as keyof Module;

  for (const { pattern, module } of routes) {
    if (pattern.test(request.url)) {
      const fn = module[method];
      if (!fn) {
        return new Response(JSON.stringify({ error: "Method tidak diizinkan." }), {
          status: 405,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      // Boundary: pastikan setiap exception di dalam handler menghasilkan JSON 500,
      // bukan crash/502 dari platform. Pesan detail disembunyikan di produksi.
      try {
        return await fn(request);
      } catch (error) {
        const message = process.env.VERCEL
          ? "Terjadi kesalahan pada server."
          : error instanceof Error
            ? error.message
            : String(error);
        if (process.env.VERCEL) console.error("API error:", error);
        return json(
          { error: message },
          { status: 500 },
        );
      }
    }
  }

  return json({ error: "Tidak ditemukan." }, { status: 404 });
}
