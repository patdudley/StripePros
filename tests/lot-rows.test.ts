import { describe, expect, it } from "vitest";
import { pointInPolygon, reconstructRowLattice, suppressTrafficLaneStalls, type RowDetection } from "../lib/lot-rows";

const FEET_PER_DEGREE_LAT = 364_000;
const BASE_LAT = 32.75;
const BASE_LNG = -117.1;
const LONGITUDE_SCALE = FEET_PER_DEGREE_LAT * Math.cos(BASE_LAT * Math.PI / 180);

function at(xFeet: number, yFeet: number) {
  return { lat: BASE_LAT + yFeet / FEET_PER_DEGREE_LAT, lng: BASE_LNG + xFeet / LONGITUDE_SCALE };
}

/** A 9 ft wide, 18 ft deep space whose row advances along the x axis. */
function stall(xFeet: number, overrides: Partial<RowDetection> = {}): RowDetection {
  const center = at(xFeet, 0);
  return {
    type: "stall",
    rowId: "north-row",
    slotIndex: 0,
    lat: center.lat,
    lng: center.lng,
    visibility: "visible",
    evidence: ["two separator lines"],
    confidence: 0.9,
    geoCorners: [at(xFeet - 4.5, -9), at(xFeet + 4.5, -9), at(xFeet + 4.5, 9), at(xFeet - 4.5, 9)],
    ...overrides,
  };
}

function marking(type: string, xFeet: number, yFeet = 0): RowDetection {
  const center = at(xFeet, yFeet);
  return {
    type,
    rowId: "aisle",
    slotIndex: 0,
    lat: center.lat,
    lng: center.lng,
    visibility: "visible",
    evidence: ["painted symbol"],
    confidence: 0.8,
  };
}

describe("point in polygon", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it("detects interior and exterior points", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });
});

describe("traffic lane suppression", () => {
  it("drops a stall rectangle that contains a directional arrow", () => {
    const detections = [stall(0), stall(9), marking("arrow", 9)];
    const kept = suppressTrafficLaneStalls(detections);
    expect(kept.filter((item) => item.type === "stall")).toHaveLength(1);
  });

  it("drops a drive-through rectangle bounded by channelizing stripes", () => {
    const detections = [stall(0), stall(9), marking("lane_line", 0)];
    expect(suppressTrafficLaneStalls(detections).filter((item) => item.type === "stall")).toHaveLength(1);
  });

  it("keeps every stall when the lot has no lane markings", () => {
    const detections = [stall(0), stall(9), stall(18)];
    expect(suppressTrafficLaneStalls(detections)).toHaveLength(3);
  });
});

describe("row lattice reconstruction", () => {
  it("collapses two rectangles drawn over a single space", () => {
    const row = [stall(0), stall(9), stall(18), stall(27), stall(36)];
    const doubled = stall(19.5, { confidence: 0.6, slotIndex: 9 });
    const rebuilt = reconstructRowLattice([...row, doubled]);
    expect(rebuilt).toHaveLength(5);
  });

  it("restores a space the model skipped in the middle of a row", () => {
    const row = [stall(0), stall(9), stall(18), stall(36), stall(45)];
    const rebuilt = reconstructRowLattice(row);
    expect(rebuilt).toHaveLength(6);
    const filled = rebuilt.find((item) => item.evidence.includes("row pitch continues between two counted spaces"));
    expect(filled?.visibility).toBe("partially_supported");
  });

  it("does not bridge a gap that holds a drive aisle", () => {
    const row = [stall(0), stall(9), stall(18), stall(36), stall(45)];
    const rebuilt = reconstructRowLattice([...row, marking("arrow", 27, 0)]);
    expect(rebuilt.filter((item) => item.type === "stall")).toHaveLength(5);
  });

  it("leaves a wide break between two parking fields alone", () => {
    const row = [stall(0), stall(9), stall(18), stall(27), stall(120), stall(129), stall(138), stall(147)];
    expect(reconstructRowLattice(row).filter((item) => item.type === "stall")).toHaveLength(8);
  });

  it("keeps ADA paint when a cell holds both a standard and an accessible read", () => {
    const row = [stall(0), stall(9), stall(18), stall(27)];
    const accessible = stall(18.5, { type: "ada", confidence: 0.55, slotIndex: 7 });
    const rebuilt = reconstructRowLattice([...row, accessible]);
    expect(rebuilt).toHaveLength(4);
    expect(rebuilt.filter((item) => item.type === "ada")).toHaveLength(1);
  });

  it("passes short rows through untouched", () => {
    const pair = [stall(0), stall(9)];
    expect(reconstructRowLattice(pair)).toHaveLength(2);
  });

  it("preserves non-stall markings", () => {
    const detections = [stall(0), stall(9), stall(18), marking("crosswalk", 40, 30)];
    const rebuilt = reconstructRowLattice(detections);
    expect(rebuilt.filter((item) => item.type === "crosswalk")).toHaveLength(1);
  });
});
