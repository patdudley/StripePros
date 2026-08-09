import { describe, expect, it } from "vitest";
import { evaluateLotPredictions } from "../lib/lot-analysis/evaluation";

describe("lot-count evaluation", () => {
  const records = [
    { id: "whole", eligibleForWholeLotEvaluation: true, labels: { standardStalls: 44, adaStalls: 2 } },
    { id: "partial", eligibleForWholeLotEvaluation: false, labels: { standardStalls: 4 } },
  ];

  it("scores only blind whole-lot predictions", () => {
    const result = evaluateLotPredictions(records, [
      { recordId: "whole", status: "counted", standardStalls: 42, adaStalls: 3, blind: true },
      { recordId: "partial", status: "counted", standardStalls: 4, blind: true },
      { recordId: "whole", status: "counted", standardStalls: 44, adaStalls: 2, blind: false },
    ]);
    expect(result.summary).toEqual({
      evaluated: 1,
      minimumBlindSamples: 10,
      evaluationStatus: "insufficient_blind_sample",
      remainingBlindSamples: 9,
      stallMae: 2,
      exactStallRate: 0,
      adaMae: 1,
    });
    expect(result.results.map((entry) => entry.reason)).toEqual([
      undefined,
      "not_whole_lot_ground_truth",
      "calibration_not_blind",
    ]);
  });

  it("does not score a boundary rejection as a fabricated count", () => {
    const result = evaluateLotPredictions(records, [
      { recordId: "whole", status: "needs_boundary", blind: true },
    ]);
    expect(result.summary.evaluated).toBe(0);
    expect(result.summary.evaluationStatus).toBe("insufficient_blind_sample");
    expect(result.summary.remainingBlindSamples).toBe(10);
    expect(result.results[0].reason).toBe("needs_boundary");
  });
});
