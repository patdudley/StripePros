export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

export type LicenseFlags = {
  displayOnly: boolean;
  automatedAnalysis: boolean;
  persistDerivedGeometry: boolean;
  persistPixels: boolean;
  trainModels: boolean;
  attributionRequired: string | null;
  sourceUrl: string;
  reviewedAt: string;
};

export type GsdMeasurement = {
  metersPerPx: number;
  basis: "source" | "nominal" | "web_mercator_nominal";
};

export type FixtureImageRequest = {
  pixelWidth: number;
  pixelHeight: number;
  format?: "png" | "jpeg" | "webp";
};

export type FixtureImage = {
  data: Buffer;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  pixelWidth: number;
  pixelHeight: number;
  bbox: BBox;
  gsd: GsdMeasurement;
};

export interface ImageryProvider {
  id: string;
  license: LicenseFlags;
  maxZoom: number | null;
  attribution: string;
  getTileUrl?(z: number, x: number, y: number): string;
  getImage?(bbox: BBox, opts: FixtureImageRequest): Promise<FixtureImage>;
  getGsdMetersPerPx(lat?: number, zoom?: number): GsdMeasurement;
  getCaptureDate(bbox: BBox): Promise<string | null>;
}

export function webMercatorNominalMetersPerPx(lat: number, zoom: number): number {
  if (!Number.isFinite(lat) || lat < -85.051129 || lat > 85.051129) throw new Error("Latitude is outside the Web Mercator extent.");
  if (!Number.isFinite(zoom) || zoom < 0) throw new Error("Zoom must be a non-negative number.");
  return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}
