"use client";

import type { LatLng, Map as LeafletMap } from "leaflet";

export type ScanViewport = { north: number; south: number; east: number; west: number };
export type ScanSection = {
  id: string;
  image: string;
  boundary: Array<{ x: number; y: number }>;
  viewport: ScanViewport;
};

type Point = { x: number; y: number };

function clipPolygon(points: Point[]) {
  const edges: Array<{ inside: (point: Point) => boolean; intersect: (a: Point, b: Point) => Point }> = [
    { inside: (p) => p.x >= 0, intersect: (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * ((0 - a.x) / (b.x - a.x)) }) },
    { inside: (p) => p.x <= 1, intersect: (a, b) => ({ x: 1, y: a.y + (b.y - a.y) * ((1 - a.x) / (b.x - a.x)) }) },
    { inside: (p) => p.y >= 0, intersect: (a, b) => ({ x: a.x + (b.x - a.x) * ((0 - a.y) / (b.y - a.y)), y: 0 }) },
    { inside: (p) => p.y <= 1, intersect: (a, b) => ({ x: a.x + (b.x - a.x) * ((1 - a.y) / (b.y - a.y)), y: 1 }) },
  ];
  return edges.reduce<Point[]>((output, edge) => {
    if (!output.length) return output;
    const next: Point[] = [];
    for (let index = 0; index < output.length; index += 1) {
      const current = output[index];
      const previous = output[(index + output.length - 1) % output.length];
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside !== previousInside) next.push(edge.intersect(previous, current));
      if (currentInside) next.push(current);
    }
    return next;
  }, points).map((point) => ({ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) }));
}

function splitBounds(boundary: LatLng[]) {
  const north = Math.max(...boundary.map((point) => point.lat));
  const south = Math.min(...boundary.map((point) => point.lat));
  const east = Math.max(...boundary.map((point) => point.lng));
  const west = Math.min(...boundary.map((point) => point.lng));
  const latitudeSpan = Math.max(north - south, 0.00001);
  const longitudeSpan = Math.max((east - west) * Math.cos(((north + south) / 2) * Math.PI / 180), 0.00001);
  const vertical = latitudeSpan >= longitudeSpan;
  const aspect = Math.max(latitudeSpan, longitudeSpan) / Math.min(latitudeSpan, longitudeSpan);
  const sectionCount = aspect >= 3 ? 4 : aspect >= 1.5 ? 3 : 2;
  const overlap = 0.2;
  const start = vertical ? south : west;
  const end = vertical ? north : east;
  const span = end - start;
  const sectionSpan = span / (sectionCount - (sectionCount - 1) * overlap);
  const step = sectionSpan * (1 - overlap);

  return Array.from({ length: sectionCount }, (_, index): ScanViewport => {
    const sectionStart = Math.min(end - sectionSpan, start + index * step);
    const sectionEnd = sectionStart + sectionSpan;
    const crossPadding = (vertical ? east - west : north - south) * 0.08;
    return vertical
      ? { north: sectionEnd, south: sectionStart, east: east + crossPadding, west: west - crossPadding }
      : { north: north + crossPadding, south: south - crossPadding, east: sectionEnd, west: sectionStart };
  });
}

async function settleMap(map: LeafletMap) {
  map.invalidateSize(false);
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function captureLotScanSections({
  map,
  mapElement,
  boundary,
  maxZoom,
  signal,
  onProgress,
}: {
  map: LeafletMap;
  mapElement: HTMLElement;
  boundary: LatLng[];
  maxZoom: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}) {
  const { toJpeg } = await import("html-to-image");
  const wholeBounds = map.getBounds();
  const sections: ScanSection[] = [];
  const targets = splitBounds(boundary);
  mapElement.classList.add("clean-scan-capture");
  try {
    for (let index = 0; index < targets.length; index += 1) {
      if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
      const target = targets[index];
      map.fitBounds([[target.south, target.west], [target.north, target.east]], { padding: [18, 18], maxZoom, animate: false });
      await settleMap(map);
      const width = mapElement.clientWidth;
      const height = mapElement.clientHeight;
      const projectedBoundary = boundary.map((latLng) => {
        const point = map.latLngToContainerPoint(latLng);
        return { x: point.x / width, y: point.y / height };
      });
      const clippedBoundary = clipPolygon(projectedBoundary);
      if (clippedBoundary.length < 3) continue;
      const bounds = map.getBounds();
      const image = await toJpeg(mapElement, { cacheBust: true, pixelRatio: 2.25, quality: .96, backgroundColor: "#11110f" });
      sections.push({
        id: `section-${index + 1}`,
        image,
        boundary: clippedBoundary,
        viewport: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
      });
      onProgress?.(index + 1, targets.length);
    }
  } finally {
    mapElement.classList.remove("clean-scan-capture");
    map.fitBounds(wholeBounds, { animate: false });
    await settleMap(map);
  }
  if (sections.length < 2) throw new Error("The lot could not be divided into usable scan sections.");
  return sections;
}
