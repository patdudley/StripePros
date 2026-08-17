import { describe, expect, it } from "vitest";
import { collapseSameRowDuplicates, mergeOverlappingDetections, tightenStallGeometry } from "../app/api/scan-lot/route";

type Located = Parameters<typeof collapseSameRowDuplicates>[0][number];

function stall(xFeet: number, yFeet: number, confidence = .9): Located {
  return {
    sectionId: "section-1",
    rowId: "south-01",
    slotIndex: 0,
    type: "stall",
    x: .5,
    y: .5,
    lat: 32.75 + yFeet / 364_000,
    lng: -117.1 + xFeet / (364_000 * Math.cos(32.75 * Math.PI / 180)),
    visibility: "visible",
    evidence: ["two separator lines"],
    confidence,
  };
}

function polygonStall(centerX: number, sectionId: string, rowId: string): Located {
  const located = stall(centerX, 0);
  const latitudeScale = 364_000;
  const longitudeScale = latitudeScale * Math.cos(located.lat * Math.PI / 180);
  return {
    ...located,
    sectionId,
    rowId,
    geoCorners: [
      { lat: located.lat - 9 / latitudeScale, lng: located.lng - 4.5 / longitudeScale },
      { lat: located.lat - 9 / latitudeScale, lng: located.lng + 4.5 / longitudeScale },
      { lat: located.lat + 9 / latitudeScale, lng: located.lng + 4.5 / longitudeScale },
      { lat: located.lat + 9 / latitudeScale, lng: located.lng - 4.5 / longitudeScale },
    ],
  };
}

describe("row-aware stall reconciliation", () => {
  it("collapses entrance and back-line markers for the same stalls without merging neighbors", () => {
    const detections = [0, 9, 18, 27].flatMap((x) => [stall(x, 0), stall(x, 14, .72)]);
    const collapsed = collapseSameRowDuplicates(detections);
    expect(collapsed).toHaveLength(4);
  });

  it("keeps adjacent stalls spaced along the row", () => {
    const detections = [0, 9, 18, 27].map((x) => stall(x, 0));
    expect(collapseSameRowDuplicates(detections)).toHaveLength(4);
  });

  it("merges the same oriented stall across crops even when local row ids differ", () => {
    const detections = [polygonStall(0, "section-1", "north-01"), polygonStall(.8, "section-2", "west-07")];
    expect(mergeOverlappingDetections(detections)).toHaveLength(1);
  });

  it("keeps adjacent oriented stall polygons separate", () => {
    const detections = [polygonStall(0, "section-1", "north-01"), polygonStall(9.5, "section-2", "west-07")];
    expect(mergeOverlappingDetections(detections)).toHaveLength(2);
  });

  it("keeps adjacent stalls separate when model boxes are oversized but slot indices differ", () => {
    const oversized = (centerX: number, slotIndex: number): Located => {
      const located = stall(centerX, 0);
      located.rowId = "east-row";
      located.slotIndex = slotIndex;
      const latitudeScale = 364_000;
      const longitudeScale = latitudeScale * Math.cos(located.lat * Math.PI / 180);
      return {
        ...located,
        geoCorners: [
          { lat: located.lat - 14 / latitudeScale, lng: located.lng - 7 / longitudeScale },
          { lat: located.lat - 14 / latitudeScale, lng: located.lng + 7 / longitudeScale },
          { lat: located.lat + 14 / latitudeScale, lng: located.lng + 7 / longitudeScale },
          { lat: located.lat + 14 / latitudeScale, lng: located.lng - 7 / longitudeScale },
        ],
      };
    };
    const detections = [0, 9, 18, 27].map((x, index) => oversized(x, index));
    expect(mergeOverlappingDetections(detections)).toHaveLength(4);
  });

  it("shrinks oversized stall polygons toward one parking space", () => {
    const located = stall(0, 0);
    const latitudeScale = 364_000;
    const longitudeScale = latitudeScale * Math.cos(located.lat * Math.PI / 180);
    const oversized: Located = {
      ...located,
      geoCorners: [
        { lat: located.lat - 14 / latitudeScale, lng: located.lng - 7 / longitudeScale },
        { lat: located.lat - 14 / latitudeScale, lng: located.lng + 7 / longitudeScale },
        { lat: located.lat + 14 / latitudeScale, lng: located.lng + 7 / longitudeScale },
        { lat: located.lat + 14 / latitudeScale, lng: located.lng - 7 / longitudeScale },
      ],
    };
    const before = oversized.geoCorners!;
    const tightened = tightenStallGeometry(oversized).geoCorners!;
    const edge = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
      Math.hypot((b.lng - a.lng) * 364_000, (b.lat - a.lat) * 364_000);
    const beforeLong = Math.max(edge(before[0], before[1]), edge(before[2], before[3]));
    const afterLong = Math.max(edge(tightened[0], tightened[1]), edge(tightened[2], tightened[3]));
    expect(afterLong).toBeLessThan(beforeLong);
    expect(afterLong).toBeLessThanOrEqual(22.5);
  });
});
