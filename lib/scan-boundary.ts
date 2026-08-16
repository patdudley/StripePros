import type { LatLng } from "leaflet";

const METERS_PER_DEGREE_LAT = 364_000;

function metersPerDegreeLng(latitude: number) {
  return METERS_PER_DEGREE_LAT * Math.cos(latitude * Math.PI / 180);
}

/** Expand a closed ring outward so boundary-edge stalls stay inside the scan footprint. */
export function expandLatLngRing(points: LatLng[], bufferMeters: number): LatLng[] {
  if (points.length < 3 || bufferMeters <= 0) return points;
  const centerLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const centerLng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
  const latScale = METERS_PER_DEGREE_LAT;
  const lngScale = metersPerDegreeLng(centerLat);
  return points.map((point) => {
    const eastMeters = (point.lng - centerLng) * lngScale;
    const northMeters = (point.lat - centerLat) * latScale;
    const length = Math.hypot(eastMeters, northMeters);
    if (length < 0.25) return point;
    const scale = (length + bufferMeters) / length;
    return {
      lat: centerLat + (northMeters * scale) / latScale,
      lng: centerLng + (eastMeters * scale) / lngScale,
    } as LatLng;
  });
}

export const SCAN_BOUNDARY_BUFFER_METERS = 6;
