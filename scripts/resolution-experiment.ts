import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { runLicensedScanPipeline, type ScanSection } from "../app/api/scan-lot/route";
import { evaluateLot, summarizeLots, type EvaluatedMarking, type MarkingClass } from "../lib/experiments/resolution";
import { LocalFixtureProvider } from "../lib/imagery/local-fixture";
import type { BBox } from "../lib/imagery/types";

type ExperimentLot = { fixture_id: string; bbox: BBox; profile: string[] };
type TruthCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: { class: MarkingClass }; geometry: EvaluatedMarking["geometry"] }>;
};
type ScanDetection = { type: string; geometry: EvaluatedMarking["geometry"] };
type ScanOutput = { detections?: ScanDetection[]; error?: string };
type Tier = { id: "A" | "B"; gsdM: number; label: string };
type Usage = { input_tokens?: number; output_tokens?: number };

const TIERS: Tier[] = [
  { id: "A", gsdM: 0.6, label: "60 cm" },
  { id: "B", gsdM: 0.1524, label: "15 cm" },
];

// The production pipeline calls the gpt-5.6 alias, which routes to GPT-5.6 Sol.
// These standard short-context prices are pinned to the official rates reviewed
// on 2026-08-10 so a later price change cannot rewrite historical experiment cost.
// https://developers.openai.com/api/docs/pricing
const INPUT_USD_PER_1M = 5;
const OUTPUT_USD_PER_1M = 30;

const REQUIRED_PROFILES: Record<string, number> = {
  clean_retail: 3,
  large_multi_row: 2,
  faded_paint: 2,
  tree_shadow: 2,
  angled_parking: 1,
};

function haversineMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function imagePath(fixtureId: string): string {
  return path.join(process.cwd(), "fixtures", "lots", fixtureId, "image.png");
}

function truthPath(fixtureId: string): string {
  return path.join(process.cwd(), "fixtures", "lots", fixtureId, "truth.geojson");
}

function splitBbox(bbox: BBox): BBox[] {
  const [west, south, east, north] = bbox;
  const width = (east - west) * Math.cos((south + north) / 2 * Math.PI / 180);
  const height = north - south;
  if (height >= width) {
    const midpoint = (south + north) / 2;
    const overlap = (north - south) * 0.1;
    return [[west, south, east, midpoint + overlap], [west, midpoint - overlap, east, north]];
  }
  const midpoint = (west + east) / 2;
  const overlap = (east - west) * 0.1;
  return [[west, south, midpoint + overlap, north], [midpoint - overlap, south, east, north]];
}

async function tierRaster(fixtureId: string, bbox: BBox, gsdM: number) {
  const centerLat = (bbox[1] + bbox[3]) / 2;
  const widthM = haversineMeters(bbox[0], centerLat, bbox[2], centerLat);
  const heightM = haversineMeters(bbox[0], bbox[1], bbox[0], bbox[3]);
  const width = Math.max(1, Math.ceil(widthM / gsdM));
  const height = Math.max(1, Math.ceil(heightM / gsdM));
  const data = await sharp(imagePath(fixtureId)).resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  return { data, width, height };
}

async function sectionsForTier(fixtureId: string, bbox: BBox, gsdM: number): Promise<ScanSection[]> {
  const raster = await tierRaster(fixtureId, bbox, gsdM);
  return Promise.all(splitBbox(bbox).map(async (sectionBbox, index) => {
    const left = Math.max(0, Math.floor((sectionBbox[0] - bbox[0]) / (bbox[2] - bbox[0]) * raster.width));
    const right = Math.min(raster.width, Math.ceil((sectionBbox[2] - bbox[0]) / (bbox[2] - bbox[0]) * raster.width));
    const top = Math.max(0, Math.floor((bbox[3] - sectionBbox[3]) / (bbox[3] - bbox[1]) * raster.height));
    const bottom = Math.min(raster.height, Math.ceil((bbox[3] - sectionBbox[1]) / (bbox[3] - bbox[1]) * raster.height));
    const image = await sharp(raster.data)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(1600, 1600, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 94 })
      .toBuffer();
    return {
      id: `section-${index + 1}`,
      image: `data:image/jpeg;base64,${image.toString("base64")}`,
      boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      viewport: { west: sectionBbox[0], south: sectionBbox[1], east: sectionBbox[2], north: sectionBbox[3] },
    };
  }));
}

function classFromScan(value: string): MarkingClass | null {
  if (value === "stall") return "standard_stall";
  if (value === "ada") return "ada_stall";
  if (value === "arrow" || value === "stop_bar") return value;
  return null;
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function formatMoney(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(3)}`;
}

async function main() {
  if (process.env.IMAGERY_PROVIDER !== "local-fixture" || process.env.AI_SCANNING_ENABLED !== "true") {
    throw new Error("Run with IMAGERY_PROVIDER=local-fixture and AI_SCANNING_ENABLED=true. No license bypass exists.");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required and must be supplied through the process environment.");
  const config = JSON.parse(await readFile(path.join(process.cwd(), "experiments", "resolution-lots.json"), "utf8")) as { lots: ExperimentLot[] };
  if (config.lots.length !== 10) throw new Error(`Resolution experiment requires exactly 10 lots; found ${config.lots.length}.`);
  for (const [profile, minimum] of Object.entries(REQUIRED_PROFILES)) {
    const count = config.lots.filter((lot) => lot.profile.includes(profile)).length;
    if (count < minimum) throw new Error(`Resolution experiment requires at least ${minimum} '${profile}' lots; found ${count}.`);
  }
  for (const lot of config.lots) {
    await access(imagePath(lot.fixture_id));
    await access(truthPath(lot.fixture_id));
  }

  const originalFetch = globalThis.fetch;
  let activeUsage: Usage[] = [];
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).includes("api.openai.com/v1/responses")) {
      const payload = await response.clone().json().catch(() => null) as { usage?: Usage } | null;
      if (payload?.usage) activeUsage.push(payload.usage);
    }
    return response;
  };

  const rows: Array<{ tier: Tier; summary: ReturnType<typeof summarizeLots>; failures: string[] }> = [];
  try {
    for (const tier of TIERS) {
      const results = [];
      const failures: string[] = [];
      for (const [index, lot] of config.lots.entries()) {
        const provider = await LocalFixtureProvider.open(lot.fixture_id);
        const truthCollection = JSON.parse(await readFile(truthPath(lot.fixture_id), "utf8")) as TruthCollection;
        const truth = truthCollection.features.map((feature) => ({ class: feature.properties.class, geometry: feature.geometry }));
        activeUsage = [];
        const started = Date.now();
        const response = await runLicensedScanPipeline({ provider, apiKey, address: lot.fixture_id, sections: await sectionsForTier(lot.fixture_id, lot.bbox, tier.gsdM) });
        const latencyMs = Date.now() - started;
        const body = await response.json() as ScanOutput;
        const costUsd = activeUsage.reduce((total, usage) => total + (Number(usage.input_tokens) || 0) / 1_000_000 * INPUT_USD_PER_1M + (Number(usage.output_tokens) || 0) / 1_000_000 * OUTPUT_USD_PER_1M, 0);
        if (!response.ok) {
          failures.push(`${lot.fixture_id}: ${body.error ?? `HTTP ${response.status}`}`);
          // A failed scan is a total miss, not an omitted sample. Keeping it in the
          // denominator prevents timeouts and unusable-image errors from improving metrics.
          results.push({ ...evaluateLot([], truth), costUsd, latencyMs });
          console.error(`[${tier.id} ${index + 1}/10] ${lot.fixture_id}: failed, ${latencyMs} ms, $${costUsd.toFixed(3)}`);
          continue;
        }
        const detections = (body.detections ?? []).flatMap((detection): EvaluatedMarking[] => {
          const markingClass = classFromScan(detection.type);
          return markingClass && detection.geometry?.type === "Polygon" ? [{ class: markingClass, geometry: detection.geometry }] : [];
        });
        results.push({ ...evaluateLot(detections, truth), costUsd, latencyMs });
        console.log(`[${tier.id} ${index + 1}/10] ${lot.fixture_id}: ${detections.length} detections, ${latencyMs} ms, $${costUsd.toFixed(3)}`);
      }
      if (results.length !== config.lots.length) throw new Error(`Tier ${tier.id} produced ${results.length} lot results instead of ${config.lots.length}.`);
      rows.push({ tier, summary: summarizeLots(results), failures });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  const generatedAt = new Date().toISOString();
  const table = rows.map(({ tier, summary, failures }) => `| ${tier.id} — ${tier.label} | ${formatPercent(summary.stallRecall)} | ${formatPercent(summary.stallPrecision)} | ${formatPercent(summary.adaRecall)} | ${formatPercent(summary.symbolRecall)} | ${formatPercent(summary.countError)} | ${formatPercent(summary.duplicateRate)} | ${formatMoney(summary.meanCostUsd)} | ${summary.meanLatencyMs === null ? "n/a" : `${(summary.meanLatencyMs / 1000).toFixed(1)} s`} | ${failures.length} |`).join("\n");
  const failureDetails = rows.flatMap(({ tier, failures }) => failures.map((failure) => `- Tier ${tier.id}: ${failure}`)).join("\n") || "- None";
  const markdown = `# Resolution tier experiment\n\nGenerated: ${generatedAt}\n\nThe same hand-labeled 15 cm truth polygons were used for every tier. Tier A was downsampled with Lanczos; the production scanner prompt/model/merger were unchanged. Tier C remains pending a licensed 7.5 cm evaluation source, per the experiment protocol. Cost uses pinned 2026-08-10 standard short-context GPT-5.6 Sol rates: $${INPUT_USD_PER_1M}/M input and $${OUTPUT_USD_PER_1M}/M output.\n\n| Tier | Stall recall | Stall precision | ADA recall | Arrow/stop-bar recall | Count error | Duplicate rate | Mean cost / lot | Mean latency | Failed lots |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n| C — 7.5 cm | pending | pending | pending | pending | pending | pending | pending | pending | pending |\n\n## Failures\n\n${failureDetails}\n`;
  await writeFile(path.join(process.cwd(), "experiments", "resolution-tiers.md"), markdown);
  console.log(markdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
