import { lineLengthFt } from "./geometry";
import type { AnnotationType, StripingService, TakeoffAnnotation } from "./types";

export type AnnotationQuoteLine = {
  id: string;
  annotationType: AnnotationType | "mobilization";
  description: string;
  unit: "each" | "LF" | "per_char" | "flat";
  quantity: number;
  unitPrice: number;
};

export const DEFAULT_TAKEOFF_PRICES: Record<string, number> = {
  standard_stall_restripe: 5,
  standard_stall_new_layout: 9,
  ada_stall_restripe: 35,
  ada_stall_new_layout: 55,
  ada_access_aisle: 55,
  directional_arrow: 15,
  speed_bump: 35,
  crosswalk: 75,
  stop_bar: 3,
  stop_bar_each: 25,
  wheel_stop: 15,
  painted_text: 8,
  painted_curb: 1.75,
  mobilization: 250,
};

export function isQuotableAnnotation(annotation: TakeoffAnnotation, realQuote = true): boolean {
  if (realQuote && annotation.provenance === "fixture") return false;
  return annotation.reviewStatus === "accepted" || annotation.reviewStatus === "edited";
}

function serviceKey(type: "standard_stall" | "ada_stall", service: StripingService) {
  return `${type}_${service}`;
}

export function aggregateAnnotationQuote(
  annotations: TakeoffAnnotation[],
  prices: Record<string, number> = DEFAULT_TAKEOFF_PRICES,
  includeMobilization = false,
): AnnotationQuoteLine[] {
  const accepted = annotations.filter((annotation) => isQuotableAnnotation(annotation, true));
  const lines = new Map<string, AnnotationQuoteLine>();

  for (const annotation of accepted) {
    const key = annotation.type === "standard_stall" || annotation.type === "ada_stall"
      ? serviceKey(annotation.type, annotation.service)
      : annotation.type === "stop_bar" && annotation.geometry.type !== "LineString" ? "stop_bar_each"
      : annotation.type;
    const isLength = annotation.type === "painted_curb" || (annotation.type === "stop_bar" && annotation.geometry.type === "LineString");
    const isText = annotation.type === "painted_text";
    const quantity = isLength && annotation.geometry.type === "LineString"
      ? lineLengthFt(annotation.geometry)
      : isText ? Math.max(1, (annotation.text ?? "").replace(/\s/g, "").length) : 1;
    const descriptions: Record<string, string> = {
      standard_stall_restripe: "Standard stalls — restripe",
      standard_stall_new_layout: "Standard stalls — new layout",
      ada_stall_restripe: "ADA stalls — restripe",
      ada_stall_new_layout: "ADA stalls — new layout",
      ada_access_aisle: "Paths of travel / access aisles",
      directional_arrow: "Directional arrows",
      speed_bump: "Speed bumps",
      crosswalk: "Crosswalks",
      stop_bar: "Solid stop lines",
      stop_bar_each: "Solid stop lines",
      wheel_stop: "Wheel stops",
      painted_text: "Painted text / stencils",
      painted_curb: "Painted curb",
    };
    const existing = lines.get(key);
    if (existing) existing.quantity += quantity;
    else lines.set(key, {
      id: key,
      annotationType: annotation.type,
      description: descriptions[key] ?? annotation.label,
      unit: isLength ? "LF" : isText ? "per_char" : "each",
      quantity,
      unitPrice: prices[key] ?? 0,
    });
  }

  if (includeMobilization) {
    lines.set("mobilization", {
      id: "mobilization",
      annotationType: "mobilization",
      description: "Mobilization — crew and equipment setup",
      unit: "flat",
      quantity: 1,
      unitPrice: prices.mobilization ?? 0,
    });
  }

  return [...lines.values()].filter((line) => line.quantity > 0);
}
