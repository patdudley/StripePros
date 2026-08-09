import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const GOOGLE_CERTS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const STATE_COOKIE = "stripepros_google_oauth";

function oauthConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "",
  };
}

function stateSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

export function googleSignInConfigured() {
  const config = oauthConfig();
  return Boolean(config.clientId && config.clientSecret);
}

export async function createGoogleSignInState(nonce: string) {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());
}

export async function verifyGoogleSignInState(state: string, nonce: string) {
  const verified = await jwtVerify(state, stateSecret(), { algorithms: ["HS256"] });
  if (verified.payload.nonce !== nonce) throw new Error("Google sign-in expired. Please try again.");
}

export function googleStateCookie(nonce: string) {
  return `${STATE_COOKIE}=${encodeURIComponent(nonce)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Secure; Max-Age=600`;
}

export function clearGoogleStateCookie() {
  return `${STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export function readGoogleStateCookie(request: Request) {
  const cookies = request.headers.get("cookie") || "";
  const value = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${STATE_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(STATE_COOKIE.length + 1)) : null;
}

export async function googleSignInUrl(redirectUri: string, nonce: string) {
  if (!googleSignInConfigured()) throw new Error("Google sign-in is not configured yet.");
  const config = oauthConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: await createGoogleSignInState(nonce),
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleIdentity(code: string, redirectUri: string) {
  if (!googleSignInConfigured()) throw new Error("Google sign-in is not configured yet.");
  const config = oauthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = await response.json() as { id_token?: string; error_description?: string };
  if (!response.ok || !token.id_token) throw new Error(token.error_description || "Google sign-in could not be completed.");
  const verified = await jwtVerify(token.id_token, GOOGLE_CERTS, {
    audience: config.clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  const { email, email_verified: emailVerified, name, sub } = verified.payload;
  if (typeof email !== "string" || emailVerified !== true || typeof sub !== "string") {
    throw new Error("Google did not return a verified Gmail address.");
  }
  return { email: email.toLowerCase(), name: typeof name === "string" ? name.trim() : "", googleSubject: sub };
}
