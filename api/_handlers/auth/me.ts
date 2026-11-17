import { authenticate } from "../../_lib/auth.js";
import { getDb } from "../../_lib/db.js";
import { json } from "../../_lib/http.js";
import { reportSchedule } from "../../_lib/report-schedule.js";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request, { allowPending: true });
  if (auth instanceof Response) return auth;

  if (auth.role === "admin") {
    return json({ role: "admin", username: auth.username, fullName: "Admin" });
  }
  const { staff } = auth;
  const db = getDb();
  const { date } = await reportSchedule(db, staff.id, Date.now());
  const { rows } = await db.execute({
    sql: `SELECT exempt FROM reporting_policy WHERE staff_id = ? AND effective_date <= ?
          ORDER BY effective_date DESC LIMIT 1`,
    args: [staff.id, date],
  });
  return json({
    role: "staff",
    fullName: staff.fullName,
    displayName: staff.displayName,
    identifier: staff.identifier,
    email: staff.email,
    status: staff.status,
    hasBackupPassword: staff.hasBackupPassword,
    isAdmin: staff.isAdmin,
    reportingExempt: Number(rows[0]?.exempt) === 1,
  });
}
