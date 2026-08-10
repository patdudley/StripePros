import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLicensedScanPipeline } from "../app/api/scan-lot/route";
import { LocalFixtureProvider } from "../lib/imagery/local-fixture";
import { assertAutomatedAnalysisAllowed, googleImageryProvider, localFixtureProviderDescriptor } from "../lib/imagery/providers";
import { webMercatorNominalMetersPerPx } from "../lib/imagery/types";

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "stripe-pros-fixture-"));
  const lot = path.join(root, "lots", "owned-001");
  await mkdir(lot, { recursive: true });
  await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify({ fixtures: [{ fixture_id: "owned-001", path: "lots/owned-001", analysis_allowed: true, persist_pixels_allowed: true, train_models_allowed: true }] }));
  await writeFile(path.join(lot, "meta.json"), JSON.stringify({ fixture_id: "owned-001", source: "StripePros synthetic test raster", source_url: "internal", license: "owned", license_verified_at: "2026-08-10", attribution: "", capture_date: "2026-08-10", nominal_resolution_m: 0.15, source_gsd_m: 0.152, crs: "EPSG:4326", bbox: [-97.75, 30.25, -97.74, 30.26], resolution_tier: "15cm", lot_profile: ["synthetic"] }));
  await writeFile(path.join(lot, "LICENSE.md"), "StripePros-owned synthetic test raster. Automated analysis, persistence, and training are permitted.\n");
  await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } }).png().toFile(path.join(lot, "image.png"));
  return root;
}

describe("imagery providers", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps Google blocked while allowing explicitly licensed fixtures", () => {
    expect(() => assertAutomatedAnalysisAllowed(googleImageryProvider)).toThrow(/not licensed/);
    expect(() => assertAutomatedAnalysisAllowed(localFixtureProviderDescriptor)).not.toThrow();
  });

  it("computes nominal Web Mercator display resolution", () => {
    expect(webMercatorNominalMetersPerPx(43, 20)).toBeCloseTo(0.1092, 3);
  });

  it("loads and crops an explicitly licensed local raster and rejects out-of-bounds requests", async () => {
    const provider = await LocalFixtureProvider.open("owned-001", await fixtureRoot());
    expect(provider.getGsdMetersPerPx()).toEqual({ metersPerPx: 0.152, basis: "source" });
    const crop = await provider.getImage([-97.749, 30.251, -97.745, 30.255], { pixelWidth: 40, pixelHeight: 30 });
    expect(crop.mediaType).toBe("image/png");
    expect(await sharp(crop.data).metadata()).toMatchObject({ width: 40, height: 30 });
    await expect(provider.getImage([-98, 30.251, -97.745, 30.255], { pixelWidth: 40, pixelHeight: 30 })).rejects.toThrow(/outside fixture/);
  });

  it("runs the licensed fixture through the unmodified detection pipeline", async () => {
    const provider = await LocalFixtureProvider.open("owned-001", await fixtureRoot());
    const boxes = [[-97.75, 30.25, -97.744, 30.26], [-97.746, 30.25, -97.74, 30.26]] as const;
    const sections = await Promise.all(boxes.map(async (bbox, index) => {
      const crop = await provider.getImage([...bbox], { pixelWidth: 80, pixelHeight: 80, format: "jpeg" });
      return {
        id: `section-${index + 1}`,
        image: `data:${crop.mediaType};base64,${crop.data.toString("base64")}`,
        boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        viewport: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] },
      };
    }));
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      const detections = call <= 2
        ? [{ sectionId: `section-${call}`, rowId: `row-${call}`, slotIndex: 0, type: "stall", x: 0.5, y: 0.5, visibility: "visible", evidence: ["two painted separators"], confidence: 0.9 }]
        : sections.map((section, index) => ({ sectionId: section.id, rowId: `row-${index + 1}`, slotIndex: 0, type: "stall", x: 0.5, y: 0.5, visibility: "visible", evidence: ["two painted separators"], confidence: 0.9 }));
      return new Response(JSON.stringify({ output_text: JSON.stringify({ imageUsable: true, failureReason: "", confidence: 0.9, summary: "fixture counted", warnings: [], detections, occludedRows: [] }) }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const response = await runLicensedScanPipeline({ provider, apiKey: "test-key", address: "Owned fixture", sections });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stalls: 2, sectionsScanned: 2, scanPasses: 2 });
    expect(call).toBe(3);
  });
});
