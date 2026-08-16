import { describe, expect, it } from "vitest";
import { parseScanPayload } from "../app/api/scan-lot/route";

const validPayload = {
  imageUsable: true,
  failureReason: "",
  confidence: 0.9,
  summary: "counted",
  warnings: [],
  detections: [],
  occludedRows: [],
};

describe("parseScanPayload", () => {
  it("parses output_text JSON", () => {
    expect(parseScanPayload({ output_text: JSON.stringify(validPayload) })).toMatchObject(validPayload);
  });

  it("joins split output content parts", () => {
    expect(parseScanPayload({
      output: [{ content: [{ text: JSON.stringify(validPayload).slice(0, 20) }, { text: JSON.stringify(validPayload).slice(20) }] }],
    })).toMatchObject(validPayload);
  });

  it("surfaces incomplete max_output_tokens responses clearly", () => {
    expect(() => parseScanPayload({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: '{"imageUsable":true,"summary":"partial',
    })).toThrow(/output limit/);
  });

  it("surfaces truncated JSON with a retry-friendly message", () => {
    expect(() => parseScanPayload({
      output_text: '{"summary":"stall row along north edge with separator rhythm and curb alignment evidence for each slot","detections":[{"rowId":"north-01","evidence":["left separator continues","right separator continues","vehicle alignment matches row interval","curb rhythm matches stall width',
    })).toThrow(/truncated/);
  });
});
