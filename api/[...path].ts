/**
 * Router catch-all — satu Serverless Function untuk semua endpoint /api/*.
 * Diperlukan agar tidak melebihi batas 12 functions di Vercel Hobby plan.
 */

import * as adminAbsenceMark from "./admin/absence/mark.js";
import * as adminAbsenceRevoke from "./admin/absence/revoke.js";
import * as adminExport from "./admin/export.js";
import * as adminHistory from "./admin/history.js";
import * as adminRecap from "./admin/recap.js";
import * as adminReportCancel from "./admin/report/cancel.js";
import * as adminReportSave from "./admin/report/save.js";
import * as adminStaff from "./admin/staff/index.js";
import * as adminStaffJabatan from "./admin/staff/jabatan.js";
import * as adminStaffResetPassword from "./admin/staff/reset-password.js";
import * as adminStaffUnlinkGoogle from "./admin/staff/unlink-google.js";
import * as adminStaffUpdate from "./admin/staff/update.js";
import * as authChangePassword from "./auth/change-password.js";
import * as authGoogleCallback from "./auth/google/callback.js";
import * as authGoogle from "./auth/google/index.js";
import * as authLogin from "./auth/login.js";
import * as authLogout from "./auth/logout.js";
import * as authMe from "./auth/me.js";
import * as authRegister from "./auth/register.js";
import * as health from "./health.js";
import * as reportsHistory from "./reports/history.js";
import * as reportsIndex from "./reports/index.js";
import * as reportsToday from "./reports/today.js";

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
  const url = new URL(request.url);
  const method = request.method as keyof Module;

  for (const { pattern, module } of routes) {
    if (pattern.test(url)) {
      const fn = module[method];
      if (!fn) {
        return new Response(JSON.stringify({ error: "Method tidak diizinkan." }), {
          status: 405,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      return fn(request);
    }
  }

  return new Response(JSON.stringify({ error: "Tidak ditemukan." }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
