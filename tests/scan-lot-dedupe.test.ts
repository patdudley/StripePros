import { describe, expect, it } from "vitest";
import { collapseSameRowDuplicates } from "../app/api/scan-lot/route";

type Located = Parameters<typeof collapseSameRowDuplicates>[0][number];

function stall(xFeet: number, yFeet: number, confidence = .9): Located {
  return {
    sectionId: "section-1",
    rowId: "south-01",
    type: "stall",
    x: .5,
    y: .5,
    lat: 32.75 + yFeet / 364_000,
    lng: -117.1 + xFeet / (364_000 * Math.cos(32.75 * Math.PI / 180)),
    confidence,
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
});
