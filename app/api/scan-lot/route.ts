import { json } from "@/lib/api";

type DetectionType = "stall" | "ada" | "arrow" | "access_aisle" | "speed_bump" | "stop_bar";
type Viewport = { north: number; south: number; east: number; west: number };
type ScanSection = { id: string; image: string; boundary: Array<{ x: number; y: number }>; viewport: Viewport };
type ModelDetection = { sectionId: string; rowId: string; type: DetectionType; x: number; y: number; confidence: number };
type LocatedDetection = ModelDetection & { lat: number; lng: number };
type OccludedRow = { sectionId: string; rowId: string; reason: string; confidence: number };
type ScanPayload = {
  imageUsable?: unknown;
  failureReason?: unknown;
  confidence?: unknown;
  summary?: unknown;
  warnings?: unknown;
  detections?: unknown;
  occludedRows?: unknown;
};

const MAX_IMAGE_LENGTH = 12_000_000;
const MAX_TOTAL_IMAGE_LENGTH = 60_000_000;

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

function normalizedPoint(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

function normalizeSections(value: unknown): ScanSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const section = raw as Record<string, unknown>;
    const image = typeof section.image === "string" ? section.image : "";
    const boundary = Array.isArray(section.boundary) ? section.boundary.map(normalizedPoint).filter((point): point is { x: number; y: number } => Boolean(point)).slice(0, 100) : [];
    const rawViewport = section.viewport && typeof section.viewport === "object" ? section.viewport as Record<string, unknown> : {};
    const viewport = { north: Number(rawViewport.north), south: Number(rawViewport.south), east: Number(rawViewport.east), west: Number(rawViewport.west) };
    if ((!image.startsWith("data:image/jpeg;base64,") && !image.startsWith("data:image/png;base64,")) || image.length > MAX_IMAGE_LENGTH || boundary.length < 3) return [];
    if (!Object.values(viewport).every(Number.isFinite) || viewport.north <= viewport.south || viewport.east <= viewport.west) return [];
    return [{ id: `section-${index + 1}`, image, boundary, viewport }];
  }).slice(0, 4);
}

function normalizeDetection(value: unknown, sectionIds: Set<string>): ModelDetection | null {
  if (!value || typeof value !== "object") return null;
  const detection = value as Record<string, unknown>;
  if (!sectionIds.has(String(detection.sectionId))) return null;
  if (detection.type !== "stall" && detection.type !== "ada" && detection.type !== "arrow" && detection.type !== "access_aisle" && detection.type !== "speed_bump" && detection.type !== "stop_bar") return null;
  const x = Number(detection.x);
  const y = Number(detection.y);
  const confidence = Number(detection.confidence);
  if (![x, y, confidence].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    sectionId: String(detection.sectionId),
    rowId: typeof detection.rowId === "string" ? detection.rowId.slice(0, 80) : "unassigned-row",
    type: detection.type,
    x,
    y,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function normalizeOccludedRow(value: unknown, sectionIds: Set<string>): OccludedRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!sectionIds.has(String(row.sectionId))) return null;
  const confidence = Number(row.confidence);
  return {
    sectionId: String(row.sectionId),
    rowId: typeof row.rowId === "string" ? row.rowId.slice(0, 80) : "unassigned-row",
    reason: typeof row.reason === "string" ? row.reason.slice(0, 220) : "Part of this row is not visible.",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}

function locateDetection(detection: ModelDetection, section: ScanSection): LocatedDetection {
  return {
    ...detection,
    lat: section.viewport.north - detection.y * (section.viewport.north - section.viewport.south),
    lng: section.viewport.west + detection.x * (section.viewport.east - section.viewport.west),
  };
}

function distanceFeet(a: LocatedDetection, b: LocatedDetection) {
  const latitudeFeet = (a.lat - b.lat) * 364_000;
  const longitudeFeet = (a.lng - b.lng) * 364_000 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(latitudeFeet, longitudeFeet);
}

export function mergeOverlappingDetections(detections: LocatedDetection[]) {
  return [...detections].sort((a, b) => b.confidence - a.confidence).reduce<LocatedDetection[]>((merged, candidate) => {
    const duplicate = merged.some((accepted) => {
      if (accepted.type !== candidate.type) return false;
      const threshold = accepted.sectionId === candidate.sectionId ? 2.5 : candidate.type === "stall" ? 6 : 5;
      return distanceFeet(accepted, candidate) <= threshold;
    });
    if (!duplicate) merged.push(candidate);
    return merged;
  }, []);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  }));
  return output;
}

function scanSchema(sectionIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["imageUsable", "failureReason", "confidence", "summary", "warnings", "detections", "occludedRows"],
    properties: {
      imageUsable: { type: "boolean" },
      failureReason: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
      warnings: { type: "array", items: { type: "string" }, maxItems: 12 },
      detections: {
        type: "array",
        maxItems: 400,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sectionId", "rowId", "type", "x", "y", "confidence"],
          properties: {
            sectionId: { type: "string", enum: sectionIds },
            rowId: { type: "string" },
            type: { type: "string", enum: ["stall", "ada", "arrow", "access_aisle", "speed_bump", "stop_bar"] },
            x: { type: "number", minimum: 0, maximum: 1 },
            y: { type: "number", minimum: 0, maximum: 1 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
      occludedRows: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sectionId", "rowId", "reason", "confidence"],
          properties: {
            sectionId: { type: "string", enum: sectionIds },
            rowId: { type: "string" },
            reason: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
  };
}

async function runVisionPass(apiKey: string, address: string, sections: ScanSection[], signal: AbortSignal, verificationSource?: ScanPayload) {
  const sectionGuide = sections.map((section) => ({ sectionId: section.id, boundary: section.boundary }));
  const prompt = verificationSource
    ? `Perform a second, independent verification of a parking-lot takeoff for ${address}. The first pass JSON is below. Recount every section row-by-row from the images; correct missed or false detections rather than merely agreeing with it. Apply the strict ADA rule again: classify a stall as ada only when blue paint belonging to that stall or a legible wheelchair symbol is visible. A nearby access aisle, path of travel, curb ramp, or hatching never proves the adjacent stall is ADA. Keep paths and stalls as independent detections. Verify every solid transverse stop_bar at a stop sign or stop position independently from crosswalks and speed bumps. Overlapping images may contain the same marking, but still localize it in the clearest section. Keep every genuinely occluded or cut-off row in occludedRows for manual confirmation. Inspect the pixels immediately outside the normalized polygon as context: if the polygon edge cuts through a visible parking row or drive aisle, add an occludedRows entry whose rowId begins boundary-edge- and whose reason says which edge must be expanded. Never call a boundary-truncated scan complete. Never estimate from lot area.\nFIRST PASS:\n${JSON.stringify(verificationSource).slice(0, 45_000)}\nSECTION BOUNDARIES:\n${JSON.stringify(sectionGuide)}`
    : `Review this single focused high-resolution aerial section for ${address}. Count only pixels inside its normalized polygon: ${JSON.stringify(sectionGuide)}. First enumerate every parking row and every drive aisle. Then inspect each row from one end to the other and assign a stable rowId such as north-01 or east-02. Return one localized detection centered in every visible marking. A stall is one non-ADA parking space bounded by visible separator lines or clearly visible separator endpoints; count it even when a parked vehicle or canopy hides the stall interior, provided both boundaries are visually supported. Never derive a row count from length or lot area. ADA CLASSIFICATION IS STRICT: classify a stall as ada only when visible blue paint belongs to that stall (blue field, blue border, or blue curb directly identifying it) or a legible wheelchair accessibility symbol is visible inside it. Do not classify an ADA stall solely because an access aisle, path of travel, curb ramp, or diagonal hatching is beside it. A path can exist without an ADA stall. Count that path independently as access_aisle, and count the adjacent space as a standard stall when its separator lines are visible but no blue or wheelchair evidence is visible. Never output both stall and ada for the same space. Traverse every drive aisle from end to end and count every painted directional arrow whose arrowhead and shaft are visually supported, including repeated arrows in sequence. Count access_aisle for each clearly visible striped access aisle or path of travel, independent of whether any adjacent stall qualifies as ADA. Count stop_bar once for every clearly visible solid transverse painted stop line at a stop sign, stop stencil, driveway exit, or controlled parking-lot intersection; do not count crosswalk bars, stall end lines, curbs, shadows, pavement seams, or lane dividers as stop_bar. Count speed_bump once for each clearly visible transverse raised speed bump or speed hump spanning a drive aisle; do not confuse stop bars, crosswalks, shadows, or pavement seams with speed bumps. If the boundaries needed to verify a stall or marking are hidden by trees, deep shadows, roofs, solar canopies, or image edges, do not invent it: put that specific row in occludedRows for manual confirmation. Inspect the visible context immediately outside the polygon too. If a polygon edge cuts through or excludes a continuous visible parking row or drive aisle, add an occludedRows entry whose rowId begins boundary-edge- and state which edge the user must expand. Do not silently omit an uncertain or boundary-truncated row. Ignore buildings, curbs, islands, ordinary lane lines, crosswalk bars, and UI. Overlap with neighboring sections is expected and will be merged geographically.`;
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  for (const section of sections) {
    content.push({ type: "input_text", text: `Image ${section.id}. Its countable boundary is ${JSON.stringify(section.boundary)}.` });
    content.push({ type: "input_image", image_url: section.image, detail: "original" });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      max_output_tokens: 5_000,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: verificationSource ? "parking_lot_verification" : "parking_lot_section_scan", strict: true, schema: scanSchema(sections.map((section) => section.id)) } },
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(error?.error?.message?.slice(0, 180) || "AI lot scanning is temporarily unavailable.");
  }
  const outputText = extractOutputText(await response.json() as unknown);
  if (!outputText) throw new Error("The AI scan returned no usable result.");
  return JSON.parse(outputText) as ScanPayload;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return json({ error: "AI lot scanning is not configured yet." }, 503);

  let body: { address?: unknown; sections?: unknown };
  try {
    body = await request.json() as { address?: unknown; sections?: unknown };
  } catch {
    return json({ error: "The lot scan request was not valid JSON." }, 400);
  }
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 300) : "";
  const sections = normalizeSections(body.sections);
  if (!address) return json({ error: "A property address is required." }, 400);
  if (sections.length < 2) return json({ error: "At least two overlapping high-resolution lot sections are required." }, 400);
  if (sections.reduce((total, section) => total + section.image.length, 0) > MAX_TOTAL_IMAGE_LENGTH) return json({ error: "The aerial sections are too large to scan together." }, 413);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const scanStartedAt = Date.now();
    console.info("lot-scan:start", { sections: sections.length });
    const scannedSections = await mapWithConcurrency(sections, sections.length, async (section) => {
      const startedAt = Date.now();
      const result = await runVisionPass(apiKey, address, [section], controller.signal);
      console.info("lot-scan:section", { section: section.id, durationMs: Date.now() - startedAt, detections: Array.isArray(result.detections) ? result.detections.length : 0 });
      return result;
    });
    const verified: ScanPayload = {
      imageUsable: scannedSections.some((section) => section.imageUsable === true),
      failureReason: scannedSections.filter((section) => section.imageUsable !== true).map((section) => section.failureReason).filter((reason): reason is string => typeof reason === "string").join(" "),
      confidence: scannedSections.reduce((total, section) => total + (Number.isFinite(Number(section.confidence)) ? Number(section.confidence) : 0), 0) / scannedSections.length,
      summary: scannedSections.map((section) => section.summary).filter((summary): summary is string => typeof summary === "string").join(" ").slice(0, 300),
      warnings: scannedSections.flatMap((section) => Array.isArray(section.warnings) ? section.warnings : []),
      detections: scannedSections.flatMap((section) => Array.isArray(section.detections) ? section.detections : []),
      occludedRows: scannedSections.flatMap((section) => Array.isArray(section.occludedRows) ? section.occludedRows : []),
    };
    const sectionIds = new Set(sections.map((section) => section.id));
    const normalized = Array.isArray(verified.detections) ? verified.detections.map((item) => normalizeDetection(item, sectionIds)).filter((item): item is ModelDetection => Boolean(item)) : [];
    const located = normalized.flatMap((detection) => {
      const section = sections.find((candidate) => candidate.id === detection.sectionId);
      return section ? [locateDetection(detection, section)] : [];
    });
    const detections = mergeOverlappingDetections(located);
    const occludedRows = Array.isArray(verified.occludedRows) ? verified.occludedRows.map((item) => normalizeOccludedRow(item, sectionIds)).filter((item): item is OccludedRow => Boolean(item)) : [];
    const warnings = Array.isArray(verified.warnings) ? verified.warnings.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 220)).slice(0, 12) : [];
    const confidence = Number(verified.confidence);
    if (verified.imageUsable !== true || (detections.length === 0 && occludedRows.length > 0)) {
      const reason = typeof verified.failureReason === "string" && verified.failureReason.trim() ? verified.failureReason.trim().slice(0, 220) : occludedRows[0]?.reason || "The aerial sections could not be reviewed reliably.";
      return json({ error: `${reason} Manual row confirmation is required.` }, 422);
    }
    const stalls = detections.filter((item) => item.type === "stall").length;
    const ada = detections.filter((item) => item.type === "ada").length;
    const arrows = detections.filter((item) => item.type === "arrow").length;
    const accessAisles = detections.filter((item) => item.type === "access_aisle").length;
    const speedBumps = detections.filter((item) => item.type === "speed_bump").length;
    const stopBars = detections.filter((item) => item.type === "stop_bar").length;
    const boundaryIncomplete = occludedRows.some((row) => row.rowId.startsWith("boundary-edge-") || /(?:boundary|polygon|outline).*(?:cuts|excludes|truncates|expand)/i.test(row.reason));
    console.info("lot-scan:complete", { durationMs: Date.now() - scanStartedAt, sections: sections.length, stalls, ada, arrows, accessAisles, speedBumps, stopBars, occludedRows: occludedRows.length });
    return json({
      stalls,
      ada,
      arrows,
      accessAisles,
      speedBumps,
      stopBars,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      summary: typeof verified.summary === "string" ? verified.summary.slice(0, 300) : "Overlapping sections scanned and verified.",
      warnings,
      occludedRows,
      requiresManualConfirmation: occludedRows.length > 0,
      boundaryIncomplete,
      scanPasses: 1,
      sectionsScanned: sections.length,
      detections: detections.map(({ type, confidence: detectionConfidence, lat, lng, rowId }) => ({ type, confidence: detectionConfidence, lat, lng, rowId })),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("lot-scan:timeout", { sections: sections.length, timeoutMs: 75_000 });
      return json({ error: "The AI scan timed out before returning a count. No zero count was recorded—retry the scan." }, 504);
    }
    return json({ error: error instanceof Error ? `AI lot scan failed: ${error.message}` : "The AI lot scan could not be completed." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
