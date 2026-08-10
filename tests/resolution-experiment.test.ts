import { describe, expect, it } from "vitest";
import { evaluateLot, summarizeLots, type EvaluatedMarking } from "../lib/experiments/resolution";

function box(x: number, y: number, kind: EvaluatedMarking["class"]): EvaluatedMarking {
  return { class: kind, geometry: { type: "Polygon", coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] } };
}

describe("resolution experiment metrics", () => {
  it("computes class metrics and geometric duplicates", () => {
    const truth = [box(0, 0, "standard_stall"), box(2, 0, "ada_stall"), box(4, 0, "arrow")];
    const detections = [box(0, 0, "standard_stall"), box(0.05, 0.05, "standard_stall"), box(2, 0, "ada_stall")];
    expect(evaluateLot(detections, truth)).toMatchObject({ stallTp: 2, stallFp: 1, stallFn: 0, adaTp: 1, symbolFn: 1, duplicateCount: 1 });
  });

  it("aggregates precision, recall, count error, cost, and latency", () => {
    const summary = summarizeLots([{ stallTp: 8, stallFp: 1, stallFn: 2, adaTp: 1, adaFn: 1, symbolTp: 2, symbolFn: 2, duplicateCount: 1, detectionCount: 12, verifiedCount: 14, detectedStallCount: 9, verifiedStallCount: 10, costUsd: 0.5, latencyMs: 1000 }]);
    expect(summary).toMatchObject({ stallRecall: 0.8, stallPrecision: 8 / 9, adaRecall: 0.5, symbolRecall: 0.5, countError: 0.1, duplicateRate: 1 / 12, meanCostUsd: 0.5, meanLatencyMs: 1000 });
  });

  it("does not let opposite per-lot count errors cancel", () => {
    const first = evaluateLot([box(0, 0, "standard_stall"), box(2, 0, "standard_stall")], [box(0, 0, "standard_stall")]);
    const second = evaluateLot([], [box(0, 0, "standard_stall")]);
    expect(summarizeLots([{ ...first, costUsd: 0, latencyMs: 1 }, { ...second, costUsd: 0, latencyMs: 1 }]).countError).toBe(1);
  });

  it("does not match an arrow to a stop bar", () => {
    expect(evaluateLot([box(0, 0, "arrow")], [box(0, 0, "stop_bar")])).toMatchObject({ symbolTp: 0, symbolFn: 1 });
  });

  it("treats a failed scan represented by no detections as a complete miss", () => {
    const metrics = evaluateLot([], [box(0, 0, "standard_stall"), box(2, 0, "ada_stall"), box(4, 0, "arrow")]);
    expect(metrics).toMatchObject({ stallTp: 0, stallFn: 2, adaFn: 1, symbolFn: 1 });
    expect(summarizeLots([{ ...metrics, costUsd: 0.2, latencyMs: 75_000 }])).toMatchObject({ stallRecall: 0, adaRecall: 0, symbolRecall: 0, meanCostUsd: 0.2, meanLatencyMs: 75_000 });
  });
});
