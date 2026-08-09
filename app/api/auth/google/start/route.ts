import { clearGoogleStateCookie, googleSignInUrl, googleStateCookie } from "@/lib/google-auth";

export async function GET(request: Request) {
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const nonce = crypto.randomUUID();
  try {
    return new Response(null, {
      status: 302,
      headers: { Location: await googleSignInUrl(redirectUri, nonce), "Set-Cookie": googleStateCookie(nonce) },
    });
  } catch (error) {
    const destination = new URL("/", request.url);
    destination.searchParams.set("auth_error", error instanceof Error ? error.message : "Google sign-in is unavailable.");
    return new Response(null, { status: 302, headers: { Location: destination.toString(), "Set-Cookie": clearGoogleStateCookie() } });
  }
}
