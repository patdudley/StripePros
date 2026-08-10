import { isAiScanningEnabled } from "../lib/ai-scanning";
import { LocalFixtureProvider } from "../lib/imagery/local-fixture";
import type { BBox } from "../lib/imagery/types";
import { runLicensedScanPipeline, type ScanSection } from "../app/api/scan-lot/route";

function overlappingHalves(bbox: BBox): BBox[] {
  const [west, south, east, north] = bbox;
  const width = east - west;
  const height = north - south;
  if (height >= width) {
    const midpoint = (south + north) / 2;
    const overlap = height * 0.1;
    return [[west, south, east, midpoint + overlap], [west, midpoint - overlap, east, north]];
  }
  const midpoint = (west + east) / 2;
  const overlap = width * 0.1;
  return [[west, south, midpoint + overlap, north], [midpoint - overlap, south, east, north]];
}

async function main() {
  if (!isAiScanningEnabled()) throw new Error("Set AI_SCANNING_ENABLED=true for the offline fixture runner.");
  if (process.env.IMAGERY_PROVIDER !== "local-fixture") throw new Error("Set IMAGERY_PROVIDER=local-fixture for the offline fixture runner.");
  const fixtureId = process.argv[2];
  if (!fixtureId) throw new Error("Usage: pnpm scan:fixture <fixture_id> [address]");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  const provider = await LocalFixtureProvider.open(fixtureId);
  const sections: ScanSection[] = [];
  for (const [index, bbox] of overlappingHalves(provider.meta.bbox).entries()) {
    const crop = await provider.getImage(bbox, { pixelWidth: 1600, pixelHeight: 1600, format: "jpeg" });
    sections.push({
      id: `section-${index + 1}`,
      image: `data:${crop.mediaType};base64,${crop.data.toString("base64")}`,
      boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      viewport: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] },
    });
  }
  const response = await runLicensedScanPipeline({
    provider,
    apiKey,
    address: process.argv.slice(3).join(" ") || fixtureId,
    sections,
  });
  const output = await response.text();
  process.stdout.write(`${output}\n`);
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
