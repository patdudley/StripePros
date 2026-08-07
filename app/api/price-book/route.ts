import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBookItems } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { readSession } from "@/lib/session";
import { priceBookItemSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const items = await getDb().select().from(priceBookItems).where(eq(priceBookItems.userId, userId)).orderBy(asc(priceBookItems.sortOrder));
    return json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const input = priceBookItemSchema.parse(await request.json());
    const [item] = await getDb().insert(priceBookItems).values({ ...input, unitPrice: input.unitPrice.toFixed(2), userId }).returning();
    return json({ item }, 201);
  } catch (error) {
    return apiError(error);
  }
}
