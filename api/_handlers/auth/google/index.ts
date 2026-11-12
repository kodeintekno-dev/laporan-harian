import { authorizationUrl, flowCookie, googleConfig, newFlow, signFlow } from "../../../_lib/google.js";

/** Halaman login mengarahkan browser ke sini. Server membuat state, nonce, dan PKCE lalu melempar ke Google. */
export async function GET(request: Request): Promise<Response> {
  const config = googleConfig();
  if (!config) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/?galat=google_belum_diset", "Cache-Control": "no-store" },
    });
  }

  const flow = newFlow();
  const headers = new Headers({
    Location: authorizationUrl(config, request, flow),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", flowCookie(await signFlow(flow)));
  return new Response(null, { status: 302, headers });
}
