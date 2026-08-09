import type { StripingService, TakeoffAnnotation } from "./types";

export type RowAssistInput = {
  start: [number, number];
  end: [number, number];
  angle: number;
  count?: number;
  spacingFt?: number;
  stallWidthFt?: number;
  stallDepthFt?: number;
  service?: StripingService;
};

function localScale(latitude: number) {
  return { x: 111_320 * Math.cos(latitude * Math.PI / 180), y: 110_540 };
}

export function generateStallRow(input: RowAssistInput, idFactory: (index: number) => string = (index) => `row-stall-${index + 1}`): TakeoffAnnotation[] {
  const latitude = (input.start[1] + input.end[1]) / 2;
  const scale = localScale(latitude);
  const dx = (input.end[0] - input.start[0]) * scale.x;
  const dy = (input.end[1] - input.start[1]) * scale.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.5) return [];

  const axis = { x: dx / length, y: dy / length };
  const perpendicular = { x: -axis.y, y: axis.x };
  const spacingM = Math.max(1.5, (input.spacingFt ?? 9) * 0.3048);
  const count = Math.max(1, Math.round(input.count ?? (Math.floor(length / spacingM) + 1)));
  const widthM = Math.max(1.5, (input.stallWidthFt ?? input.spacingFt ?? 9) * 0.3048);
  const depthM = Math.max(3, (input.stallDepthFt ?? 18) * 0.3048);
  const angle = Math.max(1, Math.min(179, input.angle)) * Math.PI / 180;
  const depthVector = {
    x: axis.x * Math.cos(angle) + perpendicular.x * Math.sin(angle),
    y: axis.y * Math.cos(angle) + perpendicular.y * Math.sin(angle),
  };

  function toLngLat(x: number, y: number): [number, number] {
    return [input.start[0] + x / scale.x, input.start[1] + y / scale.y];
  }

  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? .5 : index / (count - 1);
    const center = { x: dx * progress, y: dy * progress };
    const half = { x: axis.x * widthM / 2, y: axis.y * widthM / 2 };
    const baseLeft = { x: center.x - half.x, y: center.y - half.y };
    const baseRight = { x: center.x + half.x, y: center.y + half.y };
    const farRight = { x: baseRight.x + depthVector.x * depthM, y: baseRight.y + depthVector.y * depthM };
    const farLeft = { x: baseLeft.x + depthVector.x * depthM, y: baseLeft.y + depthVector.y * depthM };
    const ring = [baseLeft, baseRight, farRight, farLeft, baseLeft].map((point) => toLngLat(point.x, point.y));
    return {
      id: idFactory(index),
      type: "standard_stall",
      label: `Standard stall ${index + 1}`,
      geometry: { type: "Polygon", coordinates: [ring] },
      provenance: "manual",
      reviewStatus: "accepted",
      service: input.service ?? "restripe",
    };
  });
}
