import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { readSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ user: null }, 401);
    const [user] = await getDb().select({ id: users.id, email: users.email, companyName: users.companyName }).from(users).where(eq(users.id, userId)).limit(1);
    return user ? json({ user }) : json({ user: null }, 401);
  } catch (error) {
    return apiError(error);
  }
}
