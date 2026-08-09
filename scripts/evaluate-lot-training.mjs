import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataset = JSON.parse(await readFile(new URL("data/lot-training/quotes-v1.json", root), "utf8"));
const predictionSet = JSON.parse(await readFile(new URL("data/lot-training/predictions-v1.json", root), "utf8"));

const records = new Map([
  ...dataset.records.map((record) => [record.id, record]),
  ...dataset.holdouts.map((record) => [record.id, { ...record, eligibleForWholeLotEvaluation: false }]),
]);

const results = predictionSet.predictions.map((prediction) => {
  const record = records.get(prediction.recordId);
  if (!record) return { recordId: prediction.recordId, status: "excluded", reason: "unknown_record" };
  if (!prediction.blind) return { recordId: prediction.recordId, status: "excluded", reason: "calibration_not_blind" };
  if (!record.eligibleForWholeLotEvaluation) return { recordId: prediction.recordId, status: "excluded", reason: "not_whole_lot_ground_truth" };
  if (prediction.status !== "counted") return { recordId: prediction.recordId, status: "excluded", reason: prediction.status };
  const label = record.labels.totalStalls ?? record.labels.standardStalls;
  const predicted = record.labels.totalStalls !== undefined ? prediction.totalStalls : prediction.standardStalls;
  if (label === undefined || predicted === undefined) return { recordId: prediction.recordId, status: "excluded", reason: "missing_comparable_stall_count" };
  return {
    recordId: prediction.recordId,
    status: "evaluated",
    stallAbsoluteError: Math.abs(label - predicted),
    adaAbsoluteError: record.labels.adaStalls !== undefined && prediction.adaStalls !== undefined
      ? Math.abs(record.labels.adaStalls - prediction.adaStalls)
      : null,
  };
});

const evaluated = results.filter((result) => result.status === "evaluated");
const stallErrors = evaluated.map((result) => result.stallAbsoluteError);
const adaErrors = evaluated.map((result) => result.adaAbsoluteError).filter((value) => value !== null);
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const minimumBlindSamples = 10;

console.log(JSON.stringify({
  summary: {
    evaluated: evaluated.length,
    minimumBlindSamples,
    evaluationStatus: evaluated.length >= minimumBlindSamples ? "ready" : "insufficient_blind_sample",
    remainingBlindSamples: Math.max(0, minimumBlindSamples - evaluated.length),
    stallMae: average(stallErrors),
    exactStallRate: stallErrors.length ? stallErrors.filter((value) => value === 0).length / stallErrors.length : null,
    adaMae: average(adaErrors),
  },
  results,
}, null, 2));
