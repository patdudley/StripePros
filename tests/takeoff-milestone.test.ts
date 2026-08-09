import { describe, expect, it } from "vitest";
import { UnconfiguredLotDetectionProvider } from "../lib/takeoff/detection";
import { lineLengthFt, pavementAreaSqFt } from "../lib/takeoff/geometry";
import { aggregateAnnotationQuote } from "../lib/takeoff/quote";
import { generateStallRow } from "../lib/takeoff/row-assist";
import { createEmptyTakeoff, resetTakeoffForAddress, type TakeoffAnnotation } from "../lib/takeoff/types";

const point = { type: "Point" as const, coordinates: [-117.129, 32.75] as [number, number] };
const accepted = (overrides: Partial<TakeoffAnnotation>): TakeoffAnnotation => ({
  id: crypto.randomUUID(), type: "standard_stall", label: "Stall", geometry: point,
  provenance: "manual", reviewStatus: "accepted", service: "restripe", ...overrides,
});

describe("credible takeoff milestone", () => {
  it("starts real addresses at zero and clears prior annotations", () => {
    expect(createEmptyTakeoff("3008 El Cajon Blvd").annotations).toHaveLength(0);
    const next = resetTakeoffForAddress("737 Pearl St", 32.84, -117.27);
    expect(next).toMatchObject({ address: "737 Pearl St", annotations: [], exclusions: [], countsVerified: false });
  });

  it("never lets fixtures, rejected, or unreviewed detections enter a real quote", () => {
    const lines = aggregateAnnotationQuote([
      accepted({ provenance: "fixture" }),
      accepted({ provenance: "model", reviewStatus: "unreviewed" }),
      accepted({ reviewStatus: "rejected" }),
    ]);
    expect(lines).toEqual([]);
  });

  it("quotes accepted manual annotations and keeps ADA separate", () => {
    const lines = aggregateAnnotationQuote([
      accepted({ type: "standard_stall" }),
      accepted({ type: "ada_stall", label: "ADA stall" }),
    ]);
    expect(lines.map((line) => [line.id, line.quantity])).toEqual([
      ["standard_stall_restripe", 1],
      ["ada_stall_restripe", 1],
    ]);
  });

  it("does not derive curb from polygon perimeter and measures only a drawn curb line", () => {
    const boundary = { type: "Polygon" as const, coordinates: [[[-117.13, 32.75], [-117.129, 32.75], [-117.129, 32.751], [-117.13, 32.751], [-117.13, 32.75]] as [number, number][]] };
    expect(pavementAreaSqFt(boundary, [])).toBeGreaterThan(0);
    expect(aggregateAnnotationQuote([]).find((line) => line.id === "painted_curb")).toBeUndefined();
    const curb = { type: "LineString" as const, coordinates: [[-117.13, 32.75], [-117.1299, 32.75]] as [number, number][] };
    const line = aggregateAnnotationQuote([accepted({ type: "painted_curb", geometry: curb })])[0];
    expect(line.quantity).toBeCloseTo(lineLengthFt(curb), 5);
  });

  it("subtracts exclusions from pavement area", () => {
    const boundary = { type: "Polygon" as const, coordinates: [[[-117.13, 32.75], [-117.129, 32.75], [-117.129, 32.751], [-117.13, 32.751], [-117.13, 32.75]] as [number, number][]] };
    const exclusion = { type: "Polygon" as const, coordinates: [[[-117.1298, 32.7502], [-117.1296, 32.7502], [-117.1296, 32.7504], [-117.1298, 32.7504], [-117.1298, 32.7502]] as [number, number][]] };
    expect(pavementAreaSqFt(boundary, [{ id: "x", type: "building", geometry: exclusion }])).toBeLessThan(pavementAreaSqFt(boundary, []));
  });

  it("makes mobilization optional and removable", () => {
    expect(aggregateAnnotationQuote([accepted({})], undefined, false).some((line) => line.id === "mobilization")).toBe(false);
    expect(aggregateAnnotationQuote([accepted({})], undefined, true).some((line) => line.id === "mobilization")).toBe(true);
  });

  it("returns an honest unavailable detection result without blocking manual work", async () => {
    const provider = new UnconfiguredLotDetectionProvider();
    const boundary = { type: "Polygon" as const, coordinates: [[[-117.13, 32.75], [-117.129, 32.75], [-117.129, 32.751], [-117.13, 32.751], [-117.13, 32.75]] as [number, number][]] };
    await expect(provider.detect({ address: "3008 El Cajon Blvd", boundary, imageryProvider: "mapbox" })).resolves.toEqual({
      configured: false,
      message: "Automatic detection is not configured. Continue with manual takeoff.",
      annotations: [],
    });
  });

  it("row assist generates the selected count as editable annotations", () => {
    const stalls = generateStallRow({ start: [-117.1294, 32.75], end: [-117.1289, 32.75], angle: 60, count: 7 });
    expect(stalls).toHaveLength(7);
    expect(stalls.every((stall) => stall.geometry.type === "Polygon" && stall.provenance === "manual" && stall.reviewStatus === "accepted")).toBe(true);
  });
});
