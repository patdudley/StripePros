import { describe, expect, it } from "vitest";
import { expandLatLngRing, SCAN_BOUNDARY_BUFFER_METERS } from "../lib/scan-boundary";

describe("scan boundary expansion", () => {
  it("expands every vertex away from the ring centroid", () => {
    const square = [
      { lat: 32.7849, lng: -117.1258 },
      { lat: 32.7849, lng: -117.1248 },
      { lat: 32.7840, lng: -117.1248 },
      { lat: 32.7840, lng: -117.1258 },
    ];
    const expanded = expandLatLngRing(square, SCAN_BOUNDARY_BUFFER_METERS);
    const centerLat = square.reduce((sum, point) => sum + point.lat, 0) / square.length;
    const centerLng = square.reduce((sum, point) => sum + point.lng, 0) / square.length;
    for (let index = 0; index < square.length; index += 1) {
      const before = Math.hypot(square[index].lng - centerLng, square[index].lat - centerLat);
      const after = Math.hypot(expanded[index].lng - centerLng, expanded[index].lat - centerLat);
      expect(after).toBeGreaterThan(before);
    }
  });

  it("returns the original ring when no buffer is requested", () => {
    const ring = [{ lat: 1, lng: 2 }, { lat: 1.001, lng: 2.001 }, { lat: 1.002, lng: 2 }];
    expect(expandLatLngRing(ring, 0)).toEqual(ring);
  });
});
