import turfArea from "@turf/area";
import turfLength from "@turf/length";
import type { LineGeometry, LotExclusion, PolygonGeometry } from "./types";

const SQM_TO_SQFT = 10.7639104167;
const METERS_TO_FEET = 3.280839895;

function feature<T extends LineGeometry | PolygonGeometry>(geometry: T) {
  return { type: "Feature" as const, properties: {}, geometry };
}

export function polygonAreaSqFt(geometry: PolygonGeometry): number {
  return turfArea(feature(geometry)) * SQM_TO_SQFT;
}

export function lineLengthFt(geometry: LineGeometry): number {
  return turfLength(feature(geometry), { units: "kilometers" }) * 1000 * METERS_TO_FEET;
}

export function pavementAreaSqFt(boundary: PolygonGeometry | null, exclusions: LotExclusion[]): number {
  if (!boundary) return 0;
  const excluded = exclusions.reduce((sum, exclusion) => sum + polygonAreaSqFt(exclusion.geometry), 0);
  return Math.max(0, polygonAreaSqFt(boundary) - excluded);
}
