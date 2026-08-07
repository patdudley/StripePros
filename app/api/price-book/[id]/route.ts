import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceBookItems } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { readSession } from "@/lib/session";
import { priceBookPatchSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const { id } = await context.params;
    const input = priceBookPatchSchema.parse(await request.json());
    const values = { ...input, unitPrice: input.unitPrice === undefined ? undefined : input.unitPrice.toFixed(2) };
    const [item] = await getDb().update(priceBookItems).set(values).where(and(eq(priceBookItems.id, id), eq(priceBookItems.userId, userId))).returning();
    return item ? json({ item }) : json({ error: "Price book item not found." }, 404);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const { id } = await context.params;
    const [item] = await getDb().delete(priceBookItems).where(and(eq(priceBookItems.id, id), eq(priceBookItems.userId, userId))).returning({ id: priceBookItems.id });
    return item ? json({ ok: true }) : json({ error: "Price book item not found." }, 404);
  } catch (error) {
    return apiError(error);
  }
}
