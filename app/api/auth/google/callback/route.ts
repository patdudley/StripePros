import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBookItems, users } from "@/db/schema";
import { clearGoogleStateCookie, exchangeGoogleIdentity, readGoogleStateCookie, verifyGoogleSignInState } from "@/lib/google-auth";
import { hashPassword } from "@/lib/password";
import { DEFAULT_PRICE_BOOK } from "@/lib/price-book";
import { createSession, sessionCookie } from "@/lib/session";

function redirectWithCookie(url: URL, cookie: string) {
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": cookie } });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const destination = new URL("/", request.url);
  try {
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const nonce = readGoogleStateCookie(request);
    if (!code || !state || !nonce) throw new Error("Google sign-in expired. Please try again.");
    await verifyGoogleSignInState(state, nonce);
    const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
    const identity = await exchangeGoogleIdentity(code, redirectUri);
    const db = getDb();
    let [user] = await db.select({ id: users.id, email: users.email, companyName: users.companyName }).from(users).where(eq(users.email, identity.email)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({
        email: identity.email,
        companyName: identity.name || "My Striping Company",
        passwordHash: await hashPassword(`${crypto.randomUUID()}-${crypto.randomUUID()}`),
      }).returning({ id: users.id, email: users.email, companyName: users.companyName });
      await db.insert(priceBookItems).values(DEFAULT_PRICE_BOOK.map((item) => ({ ...item, userId: user.id })));
    }
    const token = await createSession(user.id);
    destination.searchParams.set("auth", "google");
    return new Response(null, {
      status: 302,
      headers: [
        ["Location", destination.toString()],
        ["Set-Cookie", clearGoogleStateCookie()],
        ["Set-Cookie", sessionCookie(token)],
      ],
    });
  } catch (error) {
    destination.searchParams.set("auth_error", error instanceof Error ? error.message : "Google sign-in could not be completed.");
    return redirectWithCookie(destination, clearGoogleStateCookie());
  }
}
