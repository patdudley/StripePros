export type LotLabelCounts = {
  standardStalls: number;
  adaStalls: number;
  accessAisles: number;
  arrows: number;
  laneLines: number;
  crosswalks: number;
  speedBumps: number;
  stopBars: number;
};

export type LotLabelInput = {
  recordId: string;
  address: string;
  lat: number;
  lng: number;
  boundary: unknown;
  counts: LotLabelCounts;
  /** False once an AI scan has run on this lot, because the label is no longer independent. */
  blind: boolean;
  wholeLotScope: boolean;
  notes: string;
};

export type StoredLotLabel = LotLabelInput & { createdAt: string };

export const COUNT_KEYS: Array<keyof LotLabelCounts> = [
  "standardStalls",
  "adaStalls",
  "accessAisles",
  "arrows",
  "laneLines",
  "crosswalks",
  "speedBumps",
  "stopBars",
];

export function slugFromAddress(address: string) {
  return address
    .toLowerCase()
    .replace(/,.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function normalizeCounts(value: unknown): LotLabelCounts | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const counts = {} as LotLabelCounts;
  for (const key of COUNT_KEYS) {
    const count = Number(source[key] ?? 0);
    if (!Number.isInteger(count) || count < 0 || count > 5_000) return null;
    counts[key] = count;
  }
  return counts;
}

/** Shapes a stored label into the record the evaluator reads. */
export function toDatasetRecord(label: StoredLotLabel) {
  return {
    id: label.recordId,
    address: label.address,
    source: "founder_verified_takeoff",
    labelledAt: label.createdAt.slice(0, 10),
    scopeType: label.wholeLotScope ? "whole_lot_restripe" : "partial_scope",
    labels: {
      standardStalls: label.counts.standardStalls,
      adaStalls: label.counts.adaStalls,
      totalStalls: label.counts.standardStalls + label.counts.adaStalls,
    },
    markings: label.counts,
    eligibleForWholeLotEvaluation: label.wholeLotScope && label.blind,
    boundary: label.boundary,
    notes: label.notes,
  };
}
