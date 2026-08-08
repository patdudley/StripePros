import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { readSession } from "@/lib/session";

export type FounderIdentity = { id: string; email: string; companyName: string };

export async function getFounder(request: Request): Promise<FounderIdentity | null> {
  const allowedEmail = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
  if (!allowedEmail) return null;

  const platformEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const platformId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (platformEmail === allowedEmail && platformId) {
    return { id: platformId, email: platformEmail, companyName: "Stripe Pros" };
  }

  const userId = await readSession(request);
  if (!userId) return null;
  const [user] = await getDb().select({ id: users.id, email: users.email, companyName: users.companyName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.email.toLowerCase() !== allowedEmail) return null;
  return user;
}

export function requestFromHeaders(requestHeaders: Headers, path = "/founder"): Request {
  return new Request(`https://stripe-pros.internal${path}`, { headers: requestHeaders });
}
