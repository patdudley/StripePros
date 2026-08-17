import { apiError, json } from "@/lib/api";
import { normalizeCounts, slugFromAddress, toDatasetRecord } from "@/lib/lot-labels/record";
import { listLotLabels, saveLotLabel } from "@/lib/lot-labels/store";

const MINIMUM_BLIND_SAMPLES = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 300) : "";
    const counts = normalizeCounts(body.counts);
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!address) return json({ error: "A property address is required." }, 400);
    if (!counts) return json({ error: "Every marking count must be a whole number." }, 400);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "The lot location is missing." }, 400);
    if (!body.boundary || typeof body.boundary !== "object") return json({ error: "Draw the lot boundary before submitting a label." }, 400);
    if (counts.standardStalls + counts.adaStalls === 0) return json({ error: "A label needs at least one counted stall." }, 400);

    const label = await saveLotLabel({
      recordId: typeof body.recordId === "string" && body.recordId.trim() ? body.recordId.trim().slice(0, 60) : slugFromAddress(address),
      address,
      lat,
      lng,
      boundary: body.boundary,
      counts,
      blind: body.blind === true,
      wholeLotScope: body.wholeLotScope !== false,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 400) : "",
    });

    return json({ saved: true, record: toDatasetRecord(label) }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  try {
    const records = (await listLotLabels()).map(toDatasetRecord);
    const eligible = records.filter((record) => record.eligibleForWholeLotEvaluation);
    return json({
      count: records.length,
      eligibleForEvaluation: eligible.length,
      remainingForBenchmark: Math.max(0, MINIMUM_BLIND_SAMPLES - eligible.length),
      records,
    });
  } catch (error) {
    return apiError(error);
  }
}
