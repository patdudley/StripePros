import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { getFounder } from "@/lib/founder/auth";
import { updateDraft } from "@/lib/founder/store";

const patchSchema = z.object({ body: z.string().min(1).max(10_000).optional(), status: z.enum(["draft", "saved", "posted"]).optional() }).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const { id } = await context.params;
    const input = patchSchema.parse(await request.json());
    const draft = await updateDraft(founder.id, id, input);
    return draft ? json({ draft }) : json({ error: "Draft not found." }, 404);
  } catch (error) { return apiError(error); }
}
