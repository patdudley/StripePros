import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCounts, toDatasetRecord, type StoredLotLabel } from "../lib/lot-labels/record";

const dataset = JSON.parse(readFileSync(new URL("../data/lot-training/quotes-v1.json", import.meta.url), "utf8"));
const workspaceSource = readFileSync(new URL("../app/workspace/credible-takeoff-workspace.tsx", import.meta.url), "utf8");

function label(overrides: Partial<StoredLotLabel> = {}): StoredLotLabel {
  return {
    recordId: "3008-el-cajon",
    address: "3008 El Cajon Blvd, San Diego, CA 92104",
    lat: 32.7556,
    lng: -117.1447,
    boundary: { type: "Polygon", coordinates: [[]] },
    counts: { standardStalls: 7, adaStalls: 1, accessAisles: 1, arrows: 2, laneLines: 0, crosswalks: 1, speedBumps: 0, stopBars: 1 },
    blind: true,
    wholeLotScope: true,
    notes: "",
    createdAt: "2026-08-17T03:00:00.000Z",
    ...overrides,
  };
}

describe("lot label capture", () => {
  it("shapes a blind whole-lot label into an evaluable record", () => {
    const record = toDatasetRecord(label());
    expect(record.eligibleForWholeLotEvaluation).toBe(true);
    expect(record.labels.totalStalls).toBe(8);
    expect(record.scopeType).toBe("whole_lot_restripe");
  });

  it("refuses to evaluate a label produced after an AI scan", () => {
    expect(toDatasetRecord(label({ blind: false })).eligibleForWholeLotEvaluation).toBe(false);
  });

  it("refuses to evaluate a partial-scope label", () => {
    expect(toDatasetRecord(label({ wholeLotScope: false })).eligibleForWholeLotEvaluation).toBe(false);
  });

  it("rejects fractional or negative counts", () => {
    expect(normalizeCounts({ standardStalls: 7.5 })).toBeNull();
    expect(normalizeCounts({ standardStalls: -1 })).toBeNull();
    expect(normalizeCounts({ standardStalls: 7 })?.adaStalls).toBe(0);
  });

  it("derives blindness from whether the scan ran rather than trusting the client", () => {
    expect(workspaceSource).toContain("blind: !aiScanUsed");
    expect(workspaceSource).toContain("setAiScanUsed(true)");
  });

  it("tracks the first pending label in the training dataset", () => {
    const pending = dataset.records.find((record: { id: string }) => record.id === "3008-el-cajon");
    expect(pending.labels).toBeNull();
    expect(pending.eligibleForWholeLotEvaluation).toBe(false);
  });
});
