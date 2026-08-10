import { json } from "@/lib/api";

type DetectionType = "stall" | "ada" | "arrow";
type ScanDetection = { type: DetectionType; x: number; y: number; confidence: number };
type ScanPayload = {
  confidence?: unknown;
  summary?: unknown;
  warnings?: unknown;
  detections?: unknown;
};

const MAX_IMAGE_LENGTH = 12_000_000;

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
}

function normalizeDetection(value: unknown): ScanDetection | null {
  if (!value || typeof value !== "object") return null;
  const detection = value as Record<string, unknown>;
  if (detection.type !== "stall" && detection.type !== "ada" && detection.type !== "arrow") return null;
  const x = Number(detection.x);
  const y = Number(detection.y);
  const confidence = Number(detection.confidence);
  if (![x, y, confidence].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { type: detection.type, x, y, confidence: Math.max(0, Math.min(1, confidence)) };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return json({ error: "AI lot scanning is not configured yet." }, 503);

  let body: { address?: unknown; image?: unknown };
  try {
    body = await request.json() as { address?: unknown; image?: unknown };
  } catch {
    return json({ error: "The lot scan request was not valid JSON." }, 400);
  }

  const address = typeof body.address === "string" ? body.address.trim().slice(0, 300) : "";
  const image = typeof body.image === "string" ? body.image : "";
  if (!address) return json({ error: "A property address is required." }, 400);
  if (!image.startsWith("data:image/jpeg;base64,") && !image.startsWith("data:image/png;base64,")) {
    return json({ error: "A captured aerial image is required." }, 400);
  }
  if (image.length > MAX_IMAGE_LENGTH) return json({ error: "The aerial capture is too large to scan." }, 413);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["confidence", "summary", "warnings", "detections"],
    properties: {
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
      warnings: { type: "array", items: { type: "string" }, maxItems: 8 },
      detections: {
        type: "array",
        maxItems: 250,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "x", "y", "confidence"],
          properties: {
            type: { type: "string", enum: ["stall", "ada", "arrow"] },
            x: { type: "number", minimum: 0, maximum: 1 },
            y: { type: "number", minimum: 0, maximum: 1 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 105_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        reasoning: { effort: "medium" },
        max_output_tokens: 8_000,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Act as a conservative parking-lot striping takeoff reviewer. The property is ${address}. Analyze only pavement inside the yellow dashed polygon in this aerial screenshot.

Work row by row, clockwise from the top-left of the selected pavement. Return one detection for every visible painted marking and put its center at normalized image coordinates x/y from 0 to 1. A standard stall is one non-ADA parking space defined by its visible separator/end lines, whether occupied or empty. An ADA stall is counted separately and must not also be counted as a standard stall. Count painted directional traffic arrows only when the arrow shape is visible. Do not count vehicles, curbs, crosswalk bars, parking-lot islands, lane lines, the yellow selection outline, buildings, UI controls, or inferred spaces hidden by trees/shadows/roofs.

Every count shown to the user will be derived from your detection list, so include exactly one localized detection per marking. If a marking is blocked or ambiguous, omit it and describe the blocked zone in warnings instead of guessing. Keep the summary short and state what was visibly counted.`,
            },
            { type: "input_image", image_url: image, detail: "original" },
          ],
        }],
        text: { format: { type: "json_schema", name: "parking_lot_scan", strict: true, schema } },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      const detail = error?.error?.message?.slice(0, 180);
      return json({ error: detail ? `AI lot scan failed: ${detail}` : "AI lot scanning is temporarily unavailable." }, 502);
    }

    const raw = await response.json() as unknown;
    const outputText = extractOutputText(raw);
    if (!outputText) return json({ error: "The AI scan returned no usable result." }, 502);
    const parsed = JSON.parse(outputText) as ScanPayload;
    const detections = Array.isArray(parsed.detections) ? parsed.detections.map(normalizeDetection).filter((item): item is ScanDetection => Boolean(item)) : [];
    const stalls = detections.filter((item) => item.type === "stall").length;
    const ada = detections.filter((item) => item.type === "ada").length;
    const arrows = detections.filter((item) => item.type === "arrow").length;
    const confidence = Number(parsed.confidence);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 220)).slice(0, 8) : [];

    return json({
      stalls,
      ada,
      arrows,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : "Visible markings analyzed.",
      warnings,
      detections,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json({ error: "The AI lot scan exceeded 105 seconds. Retry once or use a tighter lot outline." }, 504);
    return json({ error: "The AI lot scan could not be completed." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
