import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { fetchFixture } from "../lib/imagery/fixture-acquisition";

function mockArcGis(attributes: Record<string, unknown>, options: { service?: Record<string, unknown> } = {}) {
  const raster = sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/query")) return Response.json({ features: [{ attributes }] });
    if (url.pathname.endsWith("/exportImage")) {
      return new Response(new Uint8Array(await raster), { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return Response.json({ capabilities: "Image,Metadata,Catalog", maxImageWidth: 4000, maxImageHeight: 4000, pixelSizeX: 0.15, ...options.service });
  });
}

describe("fixture acquisition", () => {
  it("creates and indexes a verified Indiana CC0 fixture", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "stripe-pros-fetch-"));
    const result = await fetchFixture({
      fixtureId: "indiana-clean-001",
      bbox: [-86.159, 39.767, -86.158, 39.768],
      source: "indiana",
      fixturesRoot: root,
      retrievedAt: "2026-08-10",
      fetchImpl: mockArcGis({ Name: "in2025_18871646_6in", LowPS: 0.1524 }),
    });
    expect(result).toMatchObject({ quarantined: false, sourceGsdM: 0.1524, captureDate: "2025" });
    const manifest = JSON.parse(await readFile(path.join(root, "MANIFEST.json"), "utf8"));
    expect(manifest.fixtures[0]).toMatchObject({ fixture_id: "indiana-clean-001", analysis_allowed: true });
    expect(await readFile(path.join(result.directory, "LICENSE.md"), "utf8")).toContain("Creative Commons Zero");
  });

  it("accepts only actual USDA/USGS rasters from the mixed NAIP Plus service", async () => {
    const acceptedRoot = await mkdtemp(path.join(tmpdir(), "stripe-pros-naip-ok-"));
    const accepted = await fetchFixture({
      fixtureId: "naip-public-001",
      bbox: [-117.139, 32.753, -117.138, 32.754],
      source: "naip",
      fixturesRoot: acceptedRoot,
      fetchImpl: mockArcGis({ Name: "naip", agency: "USDA", vendor: "USDA-FSA-APFO", resolution_value: 0.6, resolution_units: "METER", acquisition_date: Date.UTC(2022, 3, 25) }),
    });
    expect(accepted.quarantined).toBe(false);
    expect(accepted.sourceGsdM).toBe(0.6);

    const rejectedRoot = await mkdtemp(path.join(tmpdir(), "stripe-pros-naip-quarantine-"));
    const rejected = await fetchFixture({
      fixtureId: "naip-commercial-001",
      bbox: [-150.001, 60, -150, 60.001],
      source: "naip",
      fixturesRoot: rejectedRoot,
      fetchImpl: mockArcGis({ Name: "commercial", agency: "PrivateVendor", resolution_value: 0.3, resolution_units: "METER" }),
    });
    expect(rejected.quarantined).toBe(true);
    await expect(readFile(path.join(rejectedRoot, "MANIFEST.json"), "utf8")).rejects.toThrow();
  });

  it("quarantines generic ArcGIS imagery unless exact rights are supplied", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "stripe-pros-generic-"));
    const result = await fetchFixture({
      fixtureId: "county-unknown-001",
      bbox: [-97.75, 30.25, -97.749, 30.251],
      source: "arcgis",
      serviceUrl: "https://example.test/arcgis/ImageServer",
      fixturesRoot: root,
      fetchImpl: mockArcGis({ Name: "county-ortho", LowPS: 0.15 }),
    });
    expect(result.quarantined).toBe(true);
    expect(result.directory).toContain(`${path.sep}quarantine${path.sep}`);
  });

  it("fails before download when the requested image exceeds service limits", async () => {
    const fetchImpl = mockArcGis({ Name: "large", LowPS: 0.15 }, { service: { maxImageWidth: 20, maxImageHeight: 20 } });
    await expect(fetchFixture({
      fixtureId: "too-large-001",
      bbox: [-86.2, 39.7, -86.1, 39.8],
      source: "indiana",
      fixturesRoot: await mkdtemp(path.join(tmpdir(), "stripe-pros-large-")),
      fetchImpl,
    })).rejects.toThrow(/service limit/);
    expect(fetchImpl.mock.calls.some(([input]) => String(input).includes("exportImage"))).toBe(false);
  });
});
