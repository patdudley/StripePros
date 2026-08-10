export const ANNOTATION_TYPES = [
  "standard_stall",
  "ada_stall",
  "ada_access_aisle",
  "directional_arrow",
  "speed_bump",
  "crosswalk",
  "stop_bar",
  "wheel_stop",
  "painted_text",
  "painted_curb",
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export type AnnotationProvenance = "manual" | "model" | "fixture";
export type AnnotationReviewStatus = "unreviewed" | "accepted" | "edited" | "rejected";
export type StripingService = "restripe" | "new_layout";
export type ExclusionType = "building" | "landscaping" | "road" | "island" | "neighboring_property";

export type PointGeometry = { type: "Point"; coordinates: [number, number] };
export type LineGeometry = { type: "LineString"; coordinates: [number, number][] };
export type PolygonGeometry = { type: "Polygon"; coordinates: [number, number][][] };
export type TakeoffGeometry = PointGeometry | LineGeometry | PolygonGeometry;

export type TakeoffAnnotation = {
  id: string;
  type: AnnotationType;
  label: string;
  geometry: TakeoffGeometry;
  provenance: AnnotationProvenance;
  reviewStatus: AnnotationReviewStatus;
  service: StripingService;
  text?: string;
};

export type LotExclusion = {
  id: string;
  type: ExclusionType;
  geometry: PolygonGeometry;
};

export type TakeoffDraft = {
  address: string;
  lat: number;
  lng: number;
  boundary: PolygonGeometry | null;
  exclusions: LotExclusion[];
  annotations: TakeoffAnnotation[];
  countsVerified: boolean;
};

export function createEmptyTakeoff(address = "", lat = 0, lng = 0): TakeoffDraft {
  return { address, lat, lng, boundary: null, exclusions: [], annotations: [], countsVerified: false };
}

export function resetTakeoffForAddress(address: string, lat: number, lng: number): TakeoffDraft {
  return createEmptyTakeoff(address, lat, lng);
}
