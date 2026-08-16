import { json } from "@/lib/api";
import { isAiScanningEnabled, SCANNING_SUSPENDED_MESSAGE } from "@/lib/ai-scanning";

type DetectionType = "stall" | "ada" | "arrow" | "access_aisle" | "speed_bump" | "stop_bar" | "lane_line";
type Visibility = "visible" | "partially_supported" | "unknown";
type NormalizedCorner = { x: number; y: number };
type LocatedCorner = { lat: number; lng: number };
type Viewport = { north: number; south: number; east: number; west: number };
type ScanSection = { id: string; image: string; boundary: Array<{ x: number; y: number }>; viewport: Viewport };
type ModelDetection = {
  sectionId: string;
  rowId: string;
  slotIndex: number;
  type: DetectionType;
  x: number;
  y: number;
  corners?: NormalizedCorner[];
  visibility: Visibility;
  evidence: string[];
  confidence: number;
};
type LocatedDetection = ModelDetection & { lat: number; lng: number; geoCorners?: LocatedCorner[] };
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

async function loadCorrectionExamples() {
  try {
    const store = await import("@/lib/scan-corrections/store");
    return await store.recentCorrectionExamples(6);
  } catch {
    return [];
  }
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  if (!Array.isArray(response.output)) return "";
  const parts: string[] = [];
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        parts.push((part as { text: string }).text);
      }
    }
  }
  return parts.join("");
}

export function parseScanPayload(payload: unknown): ScanPayload {
  const response = payload as {
    status?: string;
    incomplete_details?: { reason?: string };
  };
  if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
    throw new Error("The AI scan hit its output limit before finishing. Retry the scan or tighten the lot boundary.");
  }
  const outputText = extractOutputText(payload);
  if (!outputText.trim()) throw new Error("The AI scan returned no usable result.");
  try {
    return JSON.parse(outputText) as ScanPayload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The AI scan response was truncated before it could be parsed. Retry the scan.");
    }
    throw error;
  }
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
  if (detection.type !== "stall" && detection.type !== "ada" && detection.type !== "arrow" && detection.type !== "access_aisle" && detection.type !== "speed_bump" && detection.type !== "stop_bar" && detection.type !== "lane_line") return null;
  const x = Number(detection.x);
  const y = Number(detection.y);
  const confidence = Number(detection.confidence);
  if (![x, y, confidence].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    sectionId: String(detection.sectionId),
    rowId: typeof detection.rowId === "string" ? detection.rowId.slice(0, 80) : "unassigned-row",
    slotIndex: Number.isInteger(Number(detection.slotIndex)) ? Math.max(0, Number(detection.slotIndex)) : 0,
    type: detection.type,
    x,
    y,
    corners: Array.isArray(detection.corners)
      ? detection.corners.map(normalizedPoint).filter((point): point is NormalizedCorner => Boolean(point)).slice(0, 4)
      : undefined,
    visibility: detection.visibility === "partially_supported" || detection.visibility === "unknown" ? detection.visibility : "visible",
    evidence: Array.isArray(detection.evidence) ? detection.evidence.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 100)).slice(0, 5) : [],
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

function detectionCountsTowardQuote(detection: ModelDetection) {
  if (detection.visibility === "unknown") return false;
  if (detection.confidence >= 0.5) return true;
  return detection.visibility === "partially_supported"
    && detection.confidence >= 0.45
    && detection.rowId.toLowerCase().startsWith("boundary-edge-");
}

function locateDetection(detection: ModelDetection, section: ScanSection): LocatedDetection {
  const locate = (point: NormalizedCorner): LocatedCorner => ({
    lat: section.viewport.north - point.y * (section.viewport.north - section.viewport.south),
    lng: section.viewport.west + point.x * (section.viewport.east - section.viewport.west),
  });
  return {
    ...detection,
    lat: section.viewport.north - detection.y * (section.viewport.north - section.viewport.south),
    lng: section.viewport.west + detection.x * (section.viewport.east - section.viewport.west),
    geoCorners: detection.corners?.length === 4 ? detection.corners.map(locate) : undefined,
  };
}

type PlanePoint = { x: number; y: number };

function polygonArea(points: PlanePoint[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function signedArea(points: PlanePoint[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function polygonOverlapRatio(a: LocatedDetection, b: LocatedDetection) {
  if (a.geoCorners?.length !== 4 || b.geoCorners?.length !== 4) return 0;
  const originLat = (a.lat + b.lat) / 2;
  const originLng = (a.lng + b.lng) / 2;
  const project = (point: LocatedCorner): PlanePoint => ({
    x: (point.lng - originLng) * 364_000 * Math.cos(originLat * Math.PI / 180),
    y: (point.lat - originLat) * 364_000,
  });
  const subject = a.geoCorners.map(project);
  let clip = b.geoCorners.map(project);
  if (signedArea(clip) < 0) clip = [...clip].reverse();
  let output = signedArea(subject) < 0 ? [...subject].reverse() : subject;
  const inside = (point: PlanePoint, edgeA: PlanePoint, edgeB: PlanePoint) => (edgeB.x - edgeA.x) * (point.y - edgeA.y) - (edgeB.y - edgeA.y) * (point.x - edgeA.x) >= -1e-6;
  const intersection = (start: PlanePoint, end: PlanePoint, edgeA: PlanePoint, edgeB: PlanePoint): PlanePoint => {
    const dc = { x: edgeA.x - edgeB.x, y: edgeA.y - edgeB.y };
    const dp = { x: start.x - end.x, y: start.y - end.y };
    const denominator = dc.x * dp.y - dc.y * dp.x;
    if (Math.abs(denominator) < 1e-9) return end;
    const n1 = edgeA.x * edgeB.y - edgeA.y * edgeB.x;
    const n2 = start.x * end.y - start.y * end.x;
    return { x: (n1 * dp.x - n2 * dc.x) / denominator, y: (n1 * dp.y - n2 * dc.y) / denominator };
  };
  for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
    const input = output;
    output = [];
    if (!input.length) break;
    const edgeA = clip[edgeIndex];
    const edgeB = clip[(edgeIndex + 1) % clip.length];
    let start = input[input.length - 1];
    for (const end of input) {
      if (inside(end, edgeA, edgeB)) {
        if (!inside(start, edgeA, edgeB)) output.push(intersection(start, end, edgeA, edgeB));
        output.push(end);
      } else if (inside(start, edgeA, edgeB)) output.push(intersection(start, end, edgeA, edgeB));
      start = end;
    }
  }
  const smallerArea = Math.min(polygonArea(subject), polygonArea(clip));
  return smallerArea > 0 ? polygonArea(output) / smallerArea : 0;
}

function distanceFeet(a: LocatedDetection, b: LocatedDetection) {
  const latitudeFeet = (a.lat - b.lat) * 364_000;
  const longitudeFeet = (a.lng - b.lng) * 364_000 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(latitudeFeet, longitudeFeet);
}

export function mergeOverlappingDetections(detections: LocatedDetection[]) {
  const rowCollapsed = collapseSameRowDuplicates(detections);
  return [...rowCollapsed].sort((a, b) => b.confidence - a.confidence).reduce<LocatedDetection[]>((merged, candidate) => {
    const duplicate = merged.some((accepted) => {
      if (accepted.type !== candidate.type) return false;
      if (polygonOverlapRatio(accepted, candidate) > .4) return true;
      const threshold = accepted.sectionId === candidate.sectionId ? 2.5 : candidate.type === "stall" ? 6 : 5;
      return distanceFeet(accepted, candidate) <= threshold;
    });
    if (!duplicate) merged.push(candidate);
    return merged;
  }, []);
}

export function collapseSameRowDuplicates(detections: LocatedDetection[]) {
  const groups = new Map<string, LocatedDetection[]>();
  for (const detection of detections) {
    const key = `${detection.sectionId}:${detection.type}:${detection.rowId.toLowerCase().trim()}`;
    groups.set(key, [...(groups.get(key) ?? []), detection]);
  }
  return [...groups.values()].flatMap((group) => {
    if (group.length < 4 || (group[0].type !== "stall" && group[0].type !== "ada")) return group;
    const latitude = group.reduce((sum, point) => sum + point.lat, 0) / group.length;
    const origin = group[0];
    const points = group.map((point) => ({
      detection: point,
      x: (point.lng - origin.lng) * 364_000 * Math.cos(latitude * Math.PI / 180),
      y: (point.lat - origin.lat) * 364_000,
    }));
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const xx = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    const xy = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
    const yy = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const angle = .5 * Math.atan2(2 * xy, xx - yy);
    const axis = { x: Math.cos(angle), y: Math.sin(angle) };
    return [...points].sort((a, b) => b.detection.confidence - a.detection.confidence).reduce<typeof points>((accepted, candidate) => {
      const duplicate = accepted.some((existing) => {
        const dx = candidate.x - existing.x;
        const dy = candidate.y - existing.y;
        const alongRow = Math.abs(dx * axis.x + dy * axis.y);
        const acrossRow = Math.abs(-dx * axis.y + dy * axis.x);
        return alongRow <= 4.5 && acrossRow <= 22;
      });
      if (!duplicate) accepted.push(candidate);
      return accepted;
    }, []).map((point) => point.detection);
  });
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
          required: ["sectionId", "rowId", "slotIndex", "type", "x", "y", "corners", "visibility", "evidence", "confidence"],
          properties: {
            sectionId: { type: "string", enum: sectionIds },
            rowId: { type: "string" },
            slotIndex: { type: "integer", minimum: 0 },
            type: { type: "string", enum: ["stall", "ada", "arrow", "access_aisle", "speed_bump", "stop_bar", "lane_line"] },
            x: { type: "number", minimum: 0, maximum: 1 },
            y: { type: "number", minimum: 0, maximum: 1 },
            corners: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y"],
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
            visibility: { type: "string", enum: ["visible", "partially_supported", "unknown"] },
            evidence: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
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

async function runVisionPass(apiKey: string, address: string, sections: ScanSection[], signal: AbortSignal, verificationSource?: ScanPayload, correctionExamples: unknown[] = []) {
  const sectionGuide = sections.map((section) => ({ sectionId: section.id, boundary: section.boundary }));
  const prompt = verificationSource
    ? `You are the final row-and-slot adjudicator for a parking-lot takeoff at ${address}. The section scans below are fallible suggestions. Independently inspect every supplied image and return one corrected whole-lot result.

Complete these sweeps in order before answering:
1. ROW RECONSTRUCTION: identify each physical parking row, its dominant axis, angle, approximate stall width/depth, and both endpoints before counting any space.
2. ORDERED SLOT LEDGER: walk each row from one endpoint to the other. Assign stable slotIndex values and exactly one ledger entry per physical space. Classify it as stall, ada, partially_supported via visibility, or unknown. A partial slot needs at least two independent evidence signals in evidence (for example both separator continuations, one separator plus curb rhythm, or vehicle alignment plus a matching row interval). At row terminals where divider rhythm or vehicle alignment continues to the curb, count the final slot as partially_supported with rowId boundary-edge- when one separator plus vehicle alignment OR curb rhythm is visible. Confidence below 0.50 must be visibility unknown and must not be returned as a counted detection; flag its row instead.
3. ORIENTED GEOMETRY: return four tight corners for every detection, aligned to the actual painted space or marking. Corners must describe the physical rectangle, never a generic horizontal label. Reconcile overlapping crops geometrically: if two proposed rectangles cover the same physical space, return only the clearest one even when section rowIds differ. Adjacent slots remain separate.
4. SYMBOL SWEEPS — ARROW SWEEP, LANE LINE SWEEP, and PATH SWEEP: traverse every drive aisle for arrows and channelizing guide stripes, then independently inspect ADA paint, access aisles/paths, speed bumps, and solid stop bars.

Apply the strict ADA rule: classify a stall as ada only when visible blue paint belongs to that stall or a legible wheelchair symbol is visible. A path can exist without an ADA stall. Do not classify an ADA stall solely because an access aisle is nearby. Count access_aisle independently. Count lane_line once for every visible longitudinal channelizing stripe that guides traffic through a drive aisle, drive-through lane, or fire lane — including curved paired guide lines beside arrows. Each continuous painted guide stripe is one lane_line; parallel stripes in the same channel count separately. Do not classify stall dividers, access_aisle hatching, or transverse stop_bar lines as lane_line. Count stop_bar once for every clearly visible solid transverse painted stop line. Count speed bumps separately and do not confuse stop bars, crosswalks, shadows, or pavement seams with speed bumps. If a row is genuinely obscured, add one precise occludedRows entry instead of inventing or silently omitting spaces. Do not silently omit an uncertain or boundary-truncated row. Inspect immediately outside the polygon for truncated rows and use a boundary-edge- rowId when expansion is needed. Never estimate from lot area. Do not echo first-pass duplicates.

FIRST PASS SUGGESTIONS:
${JSON.stringify(verificationSource).slice(0, 45_000)}
SECTION BOUNDARIES:
${JSON.stringify(sectionGuide)}`
    : `Review this single focused high-resolution aerial section for ${address}. Count only pixels inside ${JSON.stringify(sectionGuide)}. The boundary is expanded ~6 meters beyond the user's outline so terminal row slots remain countable.

Use a row-first procedure. Before outputting detections, reconstruct each parking row's dominant axis, angle, endpoints, and approximate stall width/depth. Then walk the row in order and build a slot ledger. Return exactly one detection per physical space, with a stable rowId and slotIndex. Never mark the entrance, vehicle center, and back line as separate stalls. For stall and ADA detections, corners must be the four oriented corners of the actual parking rectangle. For other markings, corners must tightly bound the painted marking. Do not return generic horizontal boxes.

TERMINAL SLOTS: Do not drop the last stall in a row just because it sits near the boundary edge. When divider lines or occupied vehicles continue with the same spacing, count the terminal slot. Use rowId prefix boundary-edge- and visibility partially_supported when only one separator plus vehicle alignment or curb rhythm supports the slot.

Visibility rules: visible means the physical slot is directly supported. partially_supported requires at least two independent evidence signals listed in evidence, such as both separator continuations, one separator plus curb rhythm, or vehicle alignment plus matching row intervals — except terminal boundary-edge- slots may use one separator plus vehicle alignment or curb rhythm. Confidence below 0.50 is unknown: omit the detection and add its row to occludedRows. Never infer a count from lot length or area. Treat rowIds as local labels only; overlap with adjacent crops is expected and will be reconciled geometrically.

ADA is strict: use ada only when blue paint belonging to that stall or a legible wheelchair symbol is visible. A path/access aisle never proves the adjacent stall is ADA. Count access_aisle independently. Traverse every drive aisle end-to-end for every painted arrow and every visible lane_line channelizing stripe, including curved drive-through guide lines that may sit beside an arrow. Count solid transverse stop_bar markings and true speed bumps separately. Do not skip thin longitudinal guide stripes just because an adjacent arrow was already counted. If trees, shadows, roofs, canopies, UI, or image edges prevent two-signal support, flag the precise row for manual confirmation. Inspect immediately outside the polygon for truncated rows and use a boundary-edge- rowId when expansion is required.`;
  const learnedContext = correctionExamples.length
    ? `\n\nRECENT FOUNDER CORRECTIONS (use as behavioral examples, never as counts for this lot):\n${JSON.stringify(correctionExamples).slice(0, 12_000)}`
    : "";
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: `${prompt}${learnedContext}` }];
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
      max_output_tokens: verificationSource ? 16_000 : 12_000,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: verificationSource ? "parking_lot_verification" : "parking_lot_section_scan", strict: true, schema: scanSchema(sections.map((section) => section.id)) } },
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(error?.error?.message?.slice(0, 180) || "AI lot scanning is temporarily unavailable.");
  }
  return parseScanPayload(await response.json() as unknown);
}

export async function POST(request: Request) {
  if (!isAiScanningEnabled()) return json({ code: "SCANNING_SUSPENDED", message: SCANNING_SUSPENDED_MESSAGE }, 503);
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
    const correctionExamples = await loadCorrectionExamples();
    console.info("lot-scan:start", { sections: sections.length });
    const scannedSections = await mapWithConcurrency(sections, sections.length, async (section) => {
      const startedAt = Date.now();
      const result = await runVisionPass(apiKey, address, [section], controller.signal, undefined, correctionExamples);
      console.info("lot-scan:section", { section: section.id, durationMs: Date.now() - startedAt, detections: Array.isArray(result.detections) ? result.detections.length : 0 });
      return result;
    });
    const firstPass: ScanPayload = {
      imageUsable: scannedSections.some((section) => section.imageUsable === true),
      failureReason: scannedSections.filter((section) => section.imageUsable !== true).map((section) => section.failureReason).filter((reason): reason is string => typeof reason === "string").join(" "),
      confidence: scannedSections.reduce((total, section) => total + (Number.isFinite(Number(section.confidence)) ? Number(section.confidence) : 0), 0) / scannedSections.length,
      summary: scannedSections.map((section) => section.summary).filter((summary): summary is string => typeof summary === "string").join(" ").slice(0, 300),
      warnings: scannedSections.flatMap((section) => Array.isArray(section.warnings) ? section.warnings : []),
      detections: scannedSections.flatMap((section) => Array.isArray(section.detections) ? section.detections : []),
      occludedRows: scannedSections.flatMap((section) => Array.isArray(section.occludedRows) ? section.occludedRows : []),
    };
    clearTimeout(timeout);
    const verificationController = new AbortController();
    const verificationTimeout = setTimeout(() => verificationController.abort(), 28_000);
    let verified = firstPass;
    let scanPasses = 1;
    try {
      const verificationStartedAt = Date.now();
      verified = await runVisionPass(apiKey, address, sections, verificationController.signal, firstPass, correctionExamples);
      scanPasses = 2;
      console.info("lot-scan:verification", { durationMs: Date.now() - verificationStartedAt, detections: Array.isArray(verified.detections) ? verified.detections.length : 0 });
    } catch (verificationError) {
      console.warn("lot-scan:verification-fallback", { reason: verificationError instanceof Error ? verificationError.name : "unknown" });
      const firstWarnings = Array.isArray(firstPass.warnings) ? firstPass.warnings : [];
      verified = { ...firstPass, warnings: [...firstWarnings, "The final reconciliation pass reached its time budget; section results were preserved for manual review."] };
    } finally {
      clearTimeout(verificationTimeout);
    }
    const sectionIds = new Set(sections.map((section) => section.id));
    const normalized = Array.isArray(verified.detections) ? verified.detections
      .map((item) => normalizeDetection(item, sectionIds))
      .filter((item): item is ModelDetection => Boolean(item) && detectionCountsTowardQuote(item)) : [];
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
    const laneLines = detections.filter((item) => item.type === "lane_line").length;
    const partiallySupported = detections.filter((item) => item.visibility === "partially_supported").length;
    const boundaryIncomplete = occludedRows.some((row) => row.rowId.startsWith("boundary-edge-") || /(?:boundary|polygon|outline).*(?:cuts|excludes|truncates|expand)/i.test(row.reason));
    console.info("lot-scan:complete", { durationMs: Date.now() - scanStartedAt, sections: sections.length, stalls, ada, arrows, accessAisles, speedBumps, stopBars, laneLines, occludedRows: occludedRows.length });
    return json({
      stalls,
      ada,
      arrows,
      accessAisles,
      speedBumps,
      stopBars,
      laneLines,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      summary: typeof verified.summary === "string" ? verified.summary.slice(0, 300) : "Overlapping sections scanned and verified.",
      warnings,
      occludedRows,
      scanId: crypto.randomUUID(),
      requiresManualConfirmation: occludedRows.length > 0 || partiallySupported > 0,
      boundaryIncomplete,
      scanPasses,
      sectionsScanned: sections.length,
      detections: detections.map(({ type, confidence: detectionConfidence, lat, lng, rowId, slotIndex, visibility, evidence, geoCorners }) => ({
        type,
        confidence: detectionConfidence,
        lat,
        lng,
        rowId,
        slotIndex,
        visibility,
        evidence,
        geometry: geoCorners?.length === 4
          ? { type: "Polygon", coordinates: [[...geoCorners.map((corner) => [corner.lng, corner.lat]), [geoCorners[0].lng, geoCorners[0].lat]]] }
          : { type: "Point", coordinates: [lng, lat] },
      })),
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
