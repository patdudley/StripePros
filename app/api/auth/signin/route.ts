import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { verifyPassword } from "@/lib/password";
import { createSession, sessionCookie } from "@/lib/session";
import { credentialsSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await request.json());
    const [user] = await getDb().select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return json({ error: "Email or password is incorrect." }, 401);
    }
    const token = await createSession(user.id);
    return json({ user: { id: user.id, email: user.email, companyName: user.companyName } }, 200, {
      "Set-Cookie": sessionCookie(token),
    });
  } catch (error) {
    return apiError(error);
  }
}
