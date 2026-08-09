import { describe, expect, it } from "vitest";
import { isValidSurveyId, isValidTileCoordinate, parseNearmapCoverage } from "../lib/nearmap";

describe("Nearmap coverage", () => {
  it("selects the first survey with vertical imagery", () => {
    expect(parseNearmapCoverage({ surveys: [
      { id: "panorama-only", resources: { tiles: [{ type: "North", scale: 20 }] } },
      { id: "survey-12345678", captureDate: "2026-05-14", pixelSize: 0.055, resources: { tiles: [{ type: "Vert", scale: 21 }] } },
    ] })).toEqual({ id: "survey-12345678", captureDate: "2026-05-14", pixelSize: 0.055, maxZoom: 21 });
  });

  it("rejects missing vertical coverage", () => {
    expect(parseNearmapCoverage({ surveys: [] })).toBeNull();
    expect(parseNearmapCoverage(null)).toBeNull();
  });
});

describe("Nearmap tile validation", () => {
  it("accepts valid slippy-map coordinates", () => {
    expect(isValidTileCoordinate(19, 91455, 210123)).toBe(true);
    expect(isValidSurveyId("survey-12345678-abcd")).toBe(true);
  });

  it("rejects invalid coordinates and survey identifiers", () => {
    expect(isValidTileCoordinate(23, 1, 1)).toBe(false);
    expect(isValidTileCoordinate(2, 4, 1)).toBe(false);
    expect(isValidSurveyId("../../secret")).toBe(false);
  });
});
