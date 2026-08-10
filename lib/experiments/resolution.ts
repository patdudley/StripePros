import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection, polygon } from "@turf/helpers";

export type MarkingClass = "standard_stall" | "ada_stall" | "arrow" | "stop_bar";
export type PolygonGeometry = { type: "Polygon"; coordinates: number[][][] };
export type EvaluatedMarking = { class: MarkingClass; geometry: PolygonGeometry };
export type LotMetrics = {
  stallTp: number;
  stallFp: number;
  stallFn: number;
  adaTp: number;
  adaFn: number;
  symbolTp: number;
  symbolFn: number;
  duplicateCount: number;
  detectionCount: number;
  verifiedCount: number;
  detectedStallCount: number;
  verifiedStallCount: number;
};

function intersectionOverUnion(a: PolygonGeometry, b: PolygonGeometry): number {
  try {
    const aFeature = polygon(a.coordinates);
    const bFeature = polygon(b.coordinates);
    const overlap = intersect(featureCollection([aFeature, bFeature]));
    if (!overlap) return 0;
    const intersectionArea = area(overlap);
    const unionArea = area(aFeature) + area(bFeature) - intersectionArea;
    return unionArea > 0 ? intersectionArea / unionArea : 0;
  } catch {
    return 0;
  }
}

function isStall(marking: EvaluatedMarking): boolean {
  return marking.class === "standard_stall" || marking.class === "ada_stall";
}

function matchClass(detections: EvaluatedMarking[], truth: EvaluatedMarking[], predicate: (marking: EvaluatedMarking) => boolean) {
  const detectionIndexes = detections.map((marking, index) => ({ marking, index })).filter(({ marking }) => predicate(marking));
  const truthIndexes = truth.map((marking, index) => ({ marking, index })).filter(({ marking }) => predicate(marking));
  const candidates = detectionIndexes.flatMap((detected) => truthIndexes.map((verified) => ({
    detected: detected.index,
    verified: verified.index,
    iou: intersectionOverUnion(detected.marking.geometry, verified.marking.geometry),
  }))).filter((candidate) => candidate.iou >= 0.5).sort((a, b) => b.iou - a.iou);
  const usedDetections = new Set<number>();
  const usedTruth = new Set<number>();
  for (const candidate of candidates) {
    if (usedDetections.has(candidate.detected) || usedTruth.has(candidate.verified)) continue;
    usedDetections.add(candidate.detected);
    usedTruth.add(candidate.verified);
  }
  return { tp: usedTruth.size, fp: detectionIndexes.length - usedDetections.size, fn: truthIndexes.length - usedTruth.size };
}

function matchExactClasses(detections: EvaluatedMarking[], truth: EvaluatedMarking[], classes: MarkingClass[]) {
  return classes.reduce((total, markingClass) => {
    const result = matchClass(detections, truth, (marking) => marking.class === markingClass);
    return { tp: total.tp + result.tp, fp: total.fp + result.fp, fn: total.fn + result.fn };
  }, { tp: 0, fp: 0, fn: 0 });
}

export function evaluateLot(detections: EvaluatedMarking[], truth: EvaluatedMarking[]): LotMetrics {
  const stalls = matchClass(detections, truth, isStall);
  const ada = matchClass(detections, truth, (marking) => marking.class === "ada_stall");
  const symbols = matchExactClasses(detections, truth, ["arrow", "stop_bar"]);
  let duplicateCount = 0;
  for (let first = 0; first < detections.length; first += 1) {
    for (let second = first + 1; second < detections.length; second += 1) {
      if (detections[first].class === detections[second].class && intersectionOverUnion(detections[first].geometry, detections[second].geometry) > 0.6) duplicateCount += 1;
    }
  }
  return {
    stallTp: stalls.tp,
    stallFp: stalls.fp,
    stallFn: stalls.fn,
    adaTp: ada.tp,
    adaFn: ada.fn,
    symbolTp: symbols.tp,
    symbolFn: symbols.fn,
    duplicateCount,
    detectionCount: detections.length,
    verifiedCount: truth.length,
    detectedStallCount: detections.filter(isStall).length,
    verifiedStallCount: truth.filter(isStall).length,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function summarizeLots(lots: Array<LotMetrics & { costUsd: number; latencyMs: number }>) {
  const sum = (key: keyof LotMetrics) => lots.reduce((total, lot) => total + Number(lot[key]), 0);
  const stallTp = sum("stallTp");
  const stallFp = sum("stallFp");
  const stallFn = sum("stallFn");
  const adaTp = sum("adaTp");
  const adaFn = sum("adaFn");
  const symbolTp = sum("symbolTp");
  const symbolFn = sum("symbolFn");
  const lotCountErrors = lots.flatMap((lot) => lot.verifiedStallCount > 0
    ? [Math.abs(lot.detectedStallCount - lot.verifiedStallCount) / lot.verifiedStallCount]
    : []);
  return {
    stallRecall: ratio(stallTp, stallTp + stallFn),
    stallPrecision: ratio(stallTp, stallTp + stallFp),
    adaRecall: ratio(adaTp, adaTp + adaFn),
    symbolRecall: ratio(symbolTp, symbolTp + symbolFn),
    countError: lotCountErrors.length ? lotCountErrors.reduce((total, value) => total + value, 0) / lotCountErrors.length : null,
    duplicateRate: ratio(sum("duplicateCount"), sum("detectionCount")),
    meanCostUsd: lots.length ? lots.reduce((total, lot) => total + lot.costUsd, 0) / lots.length : null,
    meanLatencyMs: lots.length ? lots.reduce((total, lot) => total + lot.latencyMs, 0) / lots.length : null,
  };
}
