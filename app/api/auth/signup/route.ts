import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBookItems, users } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { DEFAULT_PRICE_BOOK } from "@/lib/price-book";
import { createSession, sessionCookie } from "@/lib/session";
import { signUpSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const input = signUpSchema.parse(await request.json());
    const db = getDb();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) return json({ error: "An account with this email already exists." }, 409);

    const [user] = await db.insert(users).values({
      email: input.email,
      companyName: input.companyName,
      passwordHash: await hashPassword(input.password),
    }).returning({ id: users.id, email: users.email, companyName: users.companyName });

    await db.insert(priceBookItems).values(DEFAULT_PRICE_BOOK.map((item) => ({ ...item, userId: user.id })));
    const token = await createSession(user.id);
    return json({ user }, 201, { "Set-Cookie": sessionCookie(token) });
  } catch (error) {
    return apiError(error);
  }
}
