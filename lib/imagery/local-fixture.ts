import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { BBox, FixtureImage, FixtureImageRequest, GsdMeasurement, ImageryProvider } from "@/lib/imagery/types";
import { localFixtureProviderDescriptor } from "@/lib/imagery/providers";

type FixtureMeta = {
  fixture_id: string;
  source: string;
  source_url: string;
  license: string;
  license_verified_at: string;
  attribution: string;
  capture_date: string;
  nominal_resolution_m: number;
  source_gsd_m: number | null;
  crs: string;
  bbox: BBox;
  resolution_tier: string;
  lot_profile: string[];
};

type FixtureManifest = {
  fixtures: Array<{
    fixture_id: string;
    path: string;
    analysis_allowed: true;
    persist_pixels_allowed: true;
    train_models_allowed: true;
  }>;
};

function isBBox(value: unknown): value is BBox {
  return Array.isArray(value) && value.length === 4 && value.every((item) => Number.isFinite(Number(item)))
    && Number(value[0]) < Number(value[2]) && Number(value[1]) < Number(value[3]);
}

function contains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

export class LocalFixtureProvider implements ImageryProvider {
  readonly id = localFixtureProviderDescriptor.id;
  readonly license = localFixtureProviderDescriptor.license;
  readonly maxZoom = null;
  readonly attribution: string;
  readonly meta: FixtureMeta;
  private readonly imagePath: string;

  private constructor(meta: FixtureMeta, imagePath: string) {
    this.meta = meta;
    this.imagePath = imagePath;
    this.attribution = meta.attribution;
  }

  static async open(fixtureId: string, fixturesRoot = path.resolve(process.cwd(), "fixtures")): Promise<LocalFixtureProvider> {
    const manifest = JSON.parse(await readFile(path.join(fixturesRoot, "MANIFEST.json"), "utf8")) as FixtureManifest;
    const entry = manifest.fixtures?.find((candidate) => candidate.fixture_id === fixtureId);
    if (!entry || entry.analysis_allowed !== true || entry.persist_pixels_allowed !== true || entry.train_models_allowed !== true) {
      throw new Error(`Fixture '${fixtureId}' is absent or lacks explicit analysis, persistence, and training rights.`);
    }
    const fixtureDir = path.resolve(fixturesRoot, entry.path);
    if (!fixtureDir.startsWith(`${path.resolve(fixturesRoot)}${path.sep}`)) throw new Error("Fixture path escapes the fixture root.");
    const meta = JSON.parse(await readFile(path.join(fixtureDir, "meta.json"), "utf8")) as FixtureMeta;
    if (meta.fixture_id !== fixtureId || !isBBox(meta.bbox)) throw new Error(`Fixture '${fixtureId}' has invalid metadata.`);
    if (!Number.isFinite(meta.nominal_resolution_m) || meta.nominal_resolution_m <= 0) throw new Error(`Fixture '${fixtureId}' has no valid nominal resolution.`);
    if (meta.source_gsd_m !== null && (!Number.isFinite(meta.source_gsd_m) || meta.source_gsd_m <= 0)) throw new Error(`Fixture '${fixtureId}' has invalid source GSD.`);
    await access(path.join(fixtureDir, "LICENSE.md"));
    const candidates = ["image.tif", "image.tiff", "image.webp", "image.png", "image.jpg", "image.jpeg"];
    let imagePath = "";
    for (const candidate of candidates) {
      try {
        await access(path.join(fixtureDir, candidate));
        imagePath = path.join(fixtureDir, candidate);
        break;
      } catch { /* try the next supported image */ }
    }
    if (!imagePath) throw new Error(`Fixture '${fixtureId}' has no supported raster.`);
    return new LocalFixtureProvider(meta, imagePath);
  }

  getGsdMetersPerPx(): GsdMeasurement {
    return this.meta.source_gsd_m
      ? { metersPerPx: this.meta.source_gsd_m, basis: "source" }
      : { metersPerPx: this.meta.nominal_resolution_m, basis: "nominal" };
  }

  async getCaptureDate(): Promise<string | null> {
    return this.meta.capture_date || null;
  }

  async getImage(bbox: BBox, opts: FixtureImageRequest): Promise<FixtureImage> {
    if (!isBBox(bbox) || !contains(this.meta.bbox, bbox)) throw new Error(`Requested bbox falls outside fixture '${this.meta.fixture_id}'.`);
    if (!Number.isInteger(opts.pixelWidth) || !Number.isInteger(opts.pixelHeight) || opts.pixelWidth < 1 || opts.pixelHeight < 1) {
      throw new Error("Requested pixel dimensions must be positive integers.");
    }
    const source = sharp(this.imagePath);
    const info = await source.metadata();
    if (!info.width || !info.height) throw new Error(`Fixture '${this.meta.fixture_id}' has unreadable raster dimensions.`);
    const [minLng, minLat, maxLng, maxLat] = this.meta.bbox;
    const left = Math.max(0, Math.floor((bbox[0] - minLng) / (maxLng - minLng) * info.width));
    const right = Math.min(info.width, Math.ceil((bbox[2] - minLng) / (maxLng - minLng) * info.width));
    const top = Math.max(0, Math.floor((maxLat - bbox[3]) / (maxLat - minLat) * info.height));
    const bottom = Math.min(info.height, Math.ceil((maxLat - bbox[1]) / (maxLat - minLat) * info.height));
    const format = opts.format ?? "png";
    const output = await sharp(this.imagePath)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(opts.pixelWidth, opts.pixelHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .toFormat(format)
      .toBuffer();
    return {
      data: output,
      mediaType: format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png",
      pixelWidth: opts.pixelWidth,
      pixelHeight: opts.pixelHeight,
      bbox,
      gsd: this.getGsdMetersPerPx(),
    };
  }
}
