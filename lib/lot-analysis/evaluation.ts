export type LotLabel = {
  standardStalls?: number;
  totalStalls?: number;
  adaStalls?: number;
};

export type TrainingRecord = {
  id: string;
  eligibleForWholeLotEvaluation?: boolean;
  labels: LotLabel | null;
};

export type LotPrediction = {
  recordId: string;
  status: "counted" | "needs_boundary" | "no_parking_lot";
  standardStalls?: number;
  totalStalls?: number;
  adaStalls?: number;
  blind: boolean;
};

export type EvaluatedPrediction = {
  recordId: string;
  included: boolean;
  reason?: string;
  stallAbsoluteError?: number;
  adaAbsoluteError?: number;
};

export function evaluateLotPredictions(records: TrainingRecord[], predictions: LotPrediction[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const results: EvaluatedPrediction[] = predictions.map((prediction) => {
    const record = byId.get(prediction.recordId);
    if (!record) return { recordId: prediction.recordId, included: false, reason: "unknown_record" };
    if (!prediction.blind) return { recordId: prediction.recordId, included: false, reason: "calibration_not_blind" };
    if (!record.eligibleForWholeLotEvaluation) return { recordId: prediction.recordId, included: false, reason: "not_whole_lot_ground_truth" };
    if (prediction.status !== "counted") return { recordId: prediction.recordId, included: false, reason: prediction.status };

    const labelStalls = record.labels?.totalStalls ?? record.labels?.standardStalls;
    const predictedStalls = record.labels?.totalStalls !== undefined
      ? prediction.totalStalls
      : prediction.standardStalls;
    if (labelStalls === undefined || predictedStalls === undefined) {
      return { recordId: prediction.recordId, included: false, reason: "missing_comparable_stall_count" };
    }

    return {
      recordId: prediction.recordId,
      included: true,
      stallAbsoluteError: Math.abs(labelStalls - predictedStalls),
      adaAbsoluteError: record.labels?.adaStalls !== undefined && prediction.adaStalls !== undefined
        ? Math.abs(record.labels.adaStalls - prediction.adaStalls)
        : undefined,
    };
  });

  const included = results.filter((result) => result.included);
  const stallErrors = included.flatMap((result) => result.stallAbsoluteError === undefined ? [] : [result.stallAbsoluteError]);
  const adaErrors = included.flatMap((result) => result.adaAbsoluteError === undefined ? [] : [result.adaAbsoluteError]);
  return {
    results,
    summary: {
      evaluated: included.length,
      stallMae: stallErrors.length ? stallErrors.reduce((sum, value) => sum + value, 0) / stallErrors.length : null,
      exactStallRate: stallErrors.length ? stallErrors.filter((value) => value === 0).length / stallErrors.length : null,
      adaMae: adaErrors.length ? adaErrors.reduce((sum, value) => sum + value, 0) / adaErrors.length : null,
    },
  };
}
