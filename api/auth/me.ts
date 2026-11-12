import { authenticate } from "../_lib/auth.js";
import { json } from "../_lib/http.js";

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request, { allowPending: true });
  if (auth instanceof Response) return auth;

  if (auth.role === "admin") {
    return json({ role: "admin", username: auth.username, fullName: "Admin" });
  }
  const { staff } = auth;
  return json({
    role: "staff",
    fullName: staff.fullName,
    displayName: staff.displayName,
    identifier: staff.identifier,
    email: staff.email,
    status: staff.status,
    hasBackupPassword: staff.hasBackupPassword,
  });
}
