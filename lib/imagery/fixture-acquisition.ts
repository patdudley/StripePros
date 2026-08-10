import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { BBox } from "@/lib/imagery/types";

const NAIP_SERVICE = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer";
const INDIANA_SERVICE = "https://di-ingov.img.arcgis.com/arcgis/rest/services/DynamicWebMercator/Indiana_Current_Imagery/ImageServer";

type ArcGisAttributes = Record<string, string | number | null>;
type ArcGisService = {
  description?: string;
  copyrightText?: string;
  pixelSizeX?: number;
  maxImageWidth?: number;
  maxImageHeight?: number;
  capabilities?: string;
};
type LicenseRecord = { name: string; url: string; excerpt: string; verified: boolean };

export type FixtureSource = "naip" | "indiana" | "arcgis";
export type FetchFixtureOptions = {
  fixtureId: string;
  bbox: BBox;
  source: FixtureSource;
  fixturesRoot?: string;
  serviceUrl?: string;
  lotProfile?: string[];
  targetGsdM?: number;
  license?: LicenseRecord;
  fetchImpl?: typeof fetch;
  retrievedAt?: string;
};
export type FetchFixtureResult = {
  fixtureId: string;
  directory: string;
  quarantined: boolean;
  sourceGsdM: number | null;
  nominalResolutionM: number;
  captureDate: string | null;
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

const KNOWN_LICENSES: Record<Exclude<FixtureSource, "arcgis">, LicenseRecord> = {
  naip: {
    name: "Public domain (USDA FSA NAIP / USGS The National Map)",
    url: "https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map",
    excerpt: "USGS-authored or produced data and information are considered to be in the U.S. public domain.",
    verified: true,
  },
  indiana: {
    name: "Creative Commons Zero (CC0)",
    url: "https://gisdata.in.gov/portal/home/item.html?id=61d4dc991c154af49ad7c1d675182a4f",
    excerpt: "Access to Indiana Geographic Information Office Orthoimagery is governed by Creative Commons 0 (CC0).",
    verified: true,
  },
};

function assertBBox(bbox: BBox): void {
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new Error("bbox must be west,south,east,north in EPSG:4326.");
  }
}

function assertFixtureId(fixtureId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(fixtureId)) {
    throw new Error("fixture id must contain only lowercase letters, numbers, and hyphens.");
  }
}

function haversineMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toMeters(value: number, units: unknown): number | null {
  const unit = String(units ?? "").toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit.startsWith("meter")) return value;
  if (unit.startsWith("foot") || unit.startsWith("feet")) return value * 0.3048;
  if (unit.startsWith("inch")) return value * 0.0254;
  return null;
}

function sourceGsd(source: FixtureSource, attributes: ArcGisAttributes, service: ArcGisService): number | null {
  if (source === "naip") return toMeters(Number(attributes.resolution_value), attributes.resolution_units);
  const lowPs = Number(attributes.LowPS);
  if (Number.isFinite(lowPs) && lowPs > 0) return lowPs;
  if (source === "indiana") {
    const pixelSize = Number(service.pixelSizeX);
    return Number.isFinite(pixelSize) && pixelSize > 0 ? pixelSize : null;
  }
  return null;
}

function captureDate(attributes: ArcGisAttributes): string | null {
  const timestamp = Number(attributes.acquisition_date);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toISOString().slice(0, 10);
  const year = Number(attributes.Year) || Number(String(attributes.Name ?? "").match(/(?:19|20)\d{2}/)?.[0]);
  return year >= 1900 && year <= 2200 ? `${year}` : null;
}

async function jsonRequest<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Imagery service request failed (${response.status}) for ${url.pathname}.`);
  const body = await response.json() as T & { error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "Imagery service returned an ArcGIS error.");
  return body;
}

function queryUrl(serviceUrl: string, bbox: BBox): URL {
  const center = `${(bbox[0] + bbox[2]) / 2},${(bbox[1] + bbox[3]) / 2}`;
  const url = new URL(`${serviceUrl.replace(/\/$/, "")}/query`);
  url.search = new URLSearchParams({
    f: "json", geometry: center, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", where: "Category=1", outFields: "*", returnGeometry: "false",
  }).toString();
  return url;
}

function exportUrl(serviceUrl: string, bbox: BBox, width: number, height: number): URL {
  const url = new URL(`${serviceUrl.replace(/\/$/, "")}/exportImage`);
  url.search = new URLSearchParams({
    f: "image", bbox: bbox.join(","), bboxSR: "4326", imageSR: "4326", size: `${width},${height}`,
    format: "png32", interpolation: "RSP_BilinearInterpolation",
  }).toString();
  return url;
}

function isVerifiedNaip(attributes: ArcGisAttributes): boolean {
  const agency = String(attributes.agency ?? "").toUpperCase();
  const vendor = String(attributes.vendor ?? "").toUpperCase();
  return agency.includes("USDA") || agency.includes("USGS") || vendor.includes("USDA-FSA");
}

function resolutionTier(gsd: number | null): string {
  if (gsd === null) return "unknown";
  if (gsd <= 0.09) return "7.5cm";
  if (gsd <= 0.2) return "15cm";
  if (gsd <= 0.65) return "60cm";
  return `${Math.round(gsd * 100)}cm`;
}

function licenseMarkdown(sourceUrl: string, license: LicenseRecord, retrievedAt: string, quarantined: boolean): string {
  return `# Imagery provenance\n\n- Source: ${sourceUrl}\n- Governing terms: ${license.url}\n- License: ${license.name}\n- Retrieved: ${retrievedAt}\n- Status: ${quarantined ? "QUARANTINED — not approved for analysis" : "verified for persistence and automated analysis"}\n\n> ${license.excerpt}\n`;
}

async function updateManifest(fixturesRoot: string, fixtureId: string): Promise<void> {
  const manifestPath = path.join(fixturesRoot, "MANIFEST.json");
  let manifest: FixtureManifest = { fixtures: [] };
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")) as FixtureManifest; } catch { /* create below */ }
  const entry = {
    fixture_id: fixtureId, path: `lots/${fixtureId}`, analysis_allowed: true as const,
    persist_pixels_allowed: true as const, train_models_allowed: true as const,
  };
  manifest.fixtures = [...manifest.fixtures.filter((item) => item.fixture_id !== fixtureId), entry]
    .sort((a, b) => a.fixture_id.localeCompare(b.fixture_id));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function fetchFixture(options: FetchFixtureOptions): Promise<FetchFixtureResult> {
  assertFixtureId(options.fixtureId);
  assertBBox(options.bbox);
  const fixturesRoot = path.resolve(options.fixturesRoot ?? path.join(process.cwd(), "fixtures"));
  const fetchImpl = options.fetchImpl ?? fetch;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString().slice(0, 10);
  const serviceUrl = options.source === "naip" ? NAIP_SERVICE : options.source === "indiana" ? INDIANA_SERVICE : options.serviceUrl;
  if (!serviceUrl) throw new Error("A generic ArcGIS source requires --service-url.");
  const license = options.source === "arcgis" ? options.license : KNOWN_LICENSES[options.source];
  const licenseVerified = license?.verified === true && Boolean(license.url && license.excerpt);
  const service = await jsonRequest<ArcGisService>(new URL(`${serviceUrl.replace(/\/$/, "")}?f=pjson`), fetchImpl);
  if (!service.capabilities?.includes("Image")) throw new Error("ArcGIS service does not expose image export capability.");
  const catalog = await jsonRequest<{ features?: Array<{ attributes: ArcGisAttributes }> }>(queryUrl(serviceUrl, options.bbox), fetchImpl);
  const candidates = catalog.features?.map((feature) => feature.attributes) ?? [];
  if (!candidates.length) throw new Error("No source raster covers the requested bbox center.");
  const attributes = candidates.sort((a, b) => {
    const aValue = Number(a.LowPS || a.resolution_value || Number.POSITIVE_INFINITY);
    const bValue = Number(b.LowPS || b.resolution_value || Number.POSITIVE_INFINITY);
    return aValue - bValue;
  })[0];
  const quarantined = !licenseVerified || (options.source === "naip" && !isVerifiedNaip(attributes));
  const measuredGsd = sourceGsd(options.source, attributes, service);
  const requestedGsd = options.targetGsdM ?? measuredGsd ?? (Number(service.pixelSizeX) || 0.6);
  if (!Number.isFinite(requestedGsd) || requestedGsd <= 0) throw new Error("Requested GSD must be positive.");
  const centerLat = (options.bbox[1] + options.bbox[3]) / 2;
  const widthMeters = haversineMeters(options.bbox[0], centerLat, options.bbox[2], centerLat);
  const heightMeters = haversineMeters(options.bbox[0], options.bbox[1], options.bbox[0], options.bbox[3]);
  const width = Math.max(1, Math.ceil(widthMeters / requestedGsd));
  const height = Math.max(1, Math.ceil(heightMeters / requestedGsd));
  const maxWidth = Number(service.maxImageWidth) || 4000;
  const maxHeight = Number(service.maxImageHeight) || 4000;
  if (width > maxWidth || height > maxHeight) {
    throw new Error(`Requested fixture would be ${width}x${height}; service limit is ${maxWidth}x${maxHeight}. Use a tighter bbox or coarser target GSD.`);
  }
  const imageResponse = await fetchImpl(exportUrl(serviceUrl, options.bbox, width, height));
  if (!imageResponse.ok) throw new Error(`Image export failed (${imageResponse.status}).`);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  if (!image.length) throw new Error("Image export returned an empty raster.");
  try {
    const metadata = await sharp(image).metadata();
    if (!metadata.width || !metadata.height) throw new Error("missing raster dimensions");
  } catch {
    throw new Error("Image export did not return a readable raster.");
  }

  const parent = quarantined ? path.join(fixturesRoot, "quarantine") : path.join(fixturesRoot, "lots");
  const finalDirectory = path.join(parent, options.fixtureId);
  const temporaryDirectory = path.join(parent, `.${options.fixtureId}-${Date.now()}.tmp`);
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    const nominalResolutionM = Math.max(widthMeters / width, heightMeters / height);
    const date = captureDate(attributes);
    const meta = {
      fixture_id: options.fixtureId,
      source: `${options.source}: ${String(attributes.Name ?? attributes.raster_name ?? service.description ?? "ArcGIS ImageServer")}`,
      source_url: serviceUrl,
      license: license?.name ?? "unverified",
      license_verified_at: licenseVerified ? retrievedAt : null,
      attribution: options.source === "indiana" ? "Indiana Geographic Information Office (IGIO)" : options.source === "naip" ? "USGS, USDA, The National Map" : service.copyrightText ?? "",
      capture_date: date,
      nominal_resolution_m: nominalResolutionM,
      source_gsd_m: measuredGsd,
      crs: "EPSG:4326",
      bbox: options.bbox,
      resolution_tier: resolutionTier(measuredGsd ?? nominalResolutionM),
      lot_profile: options.lotProfile ?? [],
      source_attributes: attributes,
      acquisition_status: quarantined ? "quarantined" : "verified",
    };
    const finalLicense = license ?? { name: "Unverified", url: serviceUrl, excerpt: "No explicit analysis and persistence license was supplied.", verified: false };
    await writeFile(path.join(temporaryDirectory, "image.png"), image);
    await writeFile(path.join(temporaryDirectory, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    await writeFile(path.join(temporaryDirectory, "LICENSE.md"), licenseMarkdown(serviceUrl, finalLicense, retrievedAt, quarantined));
    await rm(finalDirectory, { recursive: true, force: true });
    await rename(temporaryDirectory, finalDirectory);
    if (!quarantined) await updateManifest(fixturesRoot, options.fixtureId);
    return { fixtureId: options.fixtureId, directory: finalDirectory, quarantined, sourceGsdM: measuredGsd, nominalResolutionM, captureDate: date };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}
