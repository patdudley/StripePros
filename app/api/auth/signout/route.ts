import { json } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
