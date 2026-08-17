const FEET_PER_DEGREE_LAT = 364_000;

const MIN_ROW_MEMBERS = 3;
const MIN_MEMBERS_TO_INTERPOLATE = 4;
const ROW_PERPENDICULAR_TOLERANCE_FT = 9;
const ROW_SPAN_LIMIT_FT = 420;
const MIN_STALL_PITCH_FT = 7.5;
const MAX_STALL_PITCH_FT = 14;
const MAX_CONSECUTIVE_INTERPOLATED = 2;
const MAX_INTERPOLATED_PER_ROW = 3;

export type RowCorner = { lat: number; lng: number };

export type RowDetection = {
  type: string;
  rowId: string;
  slotIndex: number;
  lat: number;
  lng: number;
  visibility: "visible" | "partially_supported" | "unknown";
  evidence: string[];
  confidence: number;
  geoCorners?: RowCorner[];
};

type PlanePoint = { x: number; y: number };
type Axis = { x: number; y: number };

function isStallLike(type: string) {
  return type === "stall" || type === "ada";
}

function toPlane(point: RowCorner, originLat: number, originLng: number): PlanePoint {
  return {
    x: (point.lng - originLng) * FEET_PER_DEGREE_LAT * Math.cos(originLat * Math.PI / 180),
    y: (point.lat - originLat) * FEET_PER_DEGREE_LAT,
  };
}

function toLatLng(point: PlanePoint, originLat: number, originLng: number): RowCorner {
  return {
    lat: originLat + point.y / FEET_PER_DEGREE_LAT,
    lng: originLng + point.x / (FEET_PER_DEGREE_LAT * Math.cos(originLat * Math.PI / 180)),
  };
}

export function pointInPolygon(point: PlanePoint, polygon: PlanePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const straddles = current.y > point.y !== prior.y > point.y;
    if (!straddles) continue;
    const crossingX = prior.x + ((point.y - current.y) / (prior.y - current.y)) * (prior.x - current.x);
    if (point.x < crossingX) inside = !inside;
  }
  return inside;
}

/**
 * A stall rectangle is roughly 9 ft wide by 18 ft deep, so the row advances along
 * the rectangle's short edge. Falling back to principal-component fitting loses this
 * prior whenever a row is short.
 */
function axisFromPolygon(polygon: PlanePoint[]): Axis | null {
  if (polygon.length !== 4) return null;
  const first = { x: polygon[1].x - polygon[0].x, y: polygon[1].y - polygon[0].y };
  const second = { x: polygon[2].x - polygon[1].x, y: polygon[2].y - polygon[1].y };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (firstLength < 1e-6 || secondLength < 1e-6) return null;
  const shorter = firstLength <= secondLength ? first : second;
  const shorterLength = Math.min(firstLength, secondLength);
  return { x: shorter.x / shorterLength, y: shorter.y / shorterLength };
}

function principalAxis(points: PlanePoint[]): Axis {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const xx = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const xy = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const yy = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function medianPitch(sortedPositions: number[]) {
  const gaps = sortedPositions
    .slice(1)
    .map((position, index) => position - sortedPositions[index])
    // Gaps below a stall width come from duplicate boxes for one space.
    .filter((gap) => gap >= MIN_STALL_PITCH_FT && gap <= MAX_STALL_PITCH_FT * 1.6);
  if (!gaps.length) return null;
  const ordered = [...gaps].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const pitch = ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
  if (pitch < MIN_STALL_PITCH_FT || pitch > MAX_STALL_PITCH_FT) return null;
  return pitch;
}

/**
 * Drops stall rectangles that actually cover a traffic lane. An arrow or a
 * channelizing stripe painted inside the rectangle means the pavement carries
 * moving vehicles, so it cannot also be a parking space.
 */
export function suppressTrafficLaneStalls<T extends RowDetection>(detections: T[]): T[] {
  const laneMarks = detections.filter((detection) => detection.type === "arrow" || detection.type === "lane_line");
  if (!laneMarks.length) return detections;
  return detections.filter((detection) => {
    if (!isStallLike(detection.type) || detection.geoCorners?.length !== 4) return true;
    const polygon = detection.geoCorners.map((corner) => toPlane(corner, detection.lat, detection.lng));
    return !laneMarks.some((mark) => pointInPolygon(toPlane(mark, detection.lat, detection.lng), polygon));
  });
}

type Member<T> = { detection: T; center: PlanePoint; axis: Axis | null };

function clusterRows<T extends RowDetection>(members: Array<Member<T>>) {
  const remaining = [...members].sort((a, b) => b.detection.confidence - a.detection.confidence);
  const rows: Array<Array<Member<T>>> = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    let axis = seed.axis ?? { x: 1, y: 0 };
    let group = [seed];

    for (let pass = 0; pass < 2; pass += 1) {
      const anchor = group[0].center;
      const picked: Array<Member<T>> = [];
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        const dx = candidate.center.x - anchor.x;
        const dy = candidate.center.y - anchor.y;
        const along = dx * axis.x + dy * axis.y;
        const across = -dx * axis.y + dy * axis.x;
        if (Math.abs(across) > ROW_PERPENDICULAR_TOLERANCE_FT || Math.abs(along) > ROW_SPAN_LIMIT_FT) continue;
        picked.push(candidate);
        remaining.splice(index, 1);
      }
      group = [...group, ...picked];
      if (group.length >= 2) axis = principalAxis(group.map((member) => member.center));
      if (!picked.length) break;
    }

    rows.push(group);
  }

  return rows;
}

function snapRowToLattice<T extends RowDetection>(
  group: Array<Member<T>>,
  blockers: PlanePoint[],
  originLat: number,
  originLng: number,
): T[] {
  const axis = principalAxis(group.map((member) => member.center));
  const anchor = group[0].center;
  const positioned = group
    .map((member) => ({
      member,
      position: (member.center.x - anchor.x) * axis.x + (member.center.y - anchor.y) * axis.y,
    }))
    .sort((a, b) => a.position - b.position);

  const pitch = medianPitch(positioned.map((entry) => entry.position));
  if (!pitch) return group.map((member) => member.detection);

  const base = positioned[0].position;
  const cells = new Map<number, typeof positioned[number]>();
  for (const entry of positioned) {
    const index = Math.round((entry.position - base) / pitch);
    const existing = cells.get(index);
    if (!existing) {
      cells.set(index, entry);
      continue;
    }
    // One lattice cell is one space: keep the strongest read, preferring ADA paint.
    const existingIsAda = existing.member.detection.type === "ada";
    const candidateIsAda = entry.member.detection.type === "ada";
    if (candidateIsAda && !existingIsAda) cells.set(index, entry);
    else if (candidateIsAda === existingIsAda && entry.member.detection.confidence > existing.member.detection.confidence) {
      cells.set(index, entry);
    }
  }

  const occupied = [...cells.keys()].sort((a, b) => a - b);
  const kept = occupied.map((index) => cells.get(index)!.member.detection);
  if (occupied.length < MIN_MEMBERS_TO_INTERPOLATE) return kept;

  const interpolated: T[] = [];
  for (let cursor = 0; cursor < occupied.length - 1; cursor += 1) {
    const start = occupied[cursor];
    const end = occupied[cursor + 1];
    const missing = end - start - 1;
    if (missing < 1 || missing > MAX_CONSECUTIVE_INTERPOLATED) continue;
    if (interpolated.length + missing > MAX_INTERPOLATED_PER_ROW) continue;

    const neighbour = cells.get(start)!;
    const template = neighbour.member;
    if (template.detection.geoCorners?.length !== 4) continue;

    for (let step = 1; step <= missing; step += 1) {
      const shift = pitch * step;
      const offset = { x: axis.x * shift, y: axis.y * shift };
      const corners = template.detection.geoCorners.map((corner) => {
        const plane = toPlane(corner, originLat, originLng);
        return toLatLng({ x: plane.x + offset.x, y: plane.y + offset.y }, originLat, originLng);
      });
      const center = { x: template.center.x + offset.x, y: template.center.y + offset.y };
      const polygon = corners.map((corner) => toPlane(corner, originLat, originLng));
      // A gap holding an arrow, aisle, or crosswalk is a break in the row, not a space.
      if (blockers.some((blocker) => pointInPolygon(blocker, polygon))) continue;
      const location = toLatLng(center, originLat, originLng);
      interpolated.push({
        ...template.detection,
        type: "stall",
        lat: location.lat,
        lng: location.lng,
        geoCorners: corners,
        slotIndex: start + step,
        visibility: "partially_supported",
        evidence: ["row pitch continues between two counted spaces"],
        confidence: Math.min(0.5, template.detection.confidence),
      });
    }
  }

  return [...kept, ...interpolated];
}

/**
 * Rebuilds each parking row as a regular lattice. Stalls in a row share one axis
 * and one pitch, so snapping detections onto that lattice collapses two boxes
 * drawn over a single space and restores a space the model skipped mid-row.
 */
export function reconstructRowLattice<T extends RowDetection>(detections: T[]): T[] {
  const stalls = detections.filter((detection) => isStallLike(detection.type));
  const others = detections.filter((detection) => !isStallLike(detection.type));
  if (stalls.length < MIN_ROW_MEMBERS) return detections;

  const originLat = stalls.reduce((sum, detection) => sum + detection.lat, 0) / stalls.length;
  const originLng = stalls.reduce((sum, detection) => sum + detection.lng, 0) / stalls.length;
  const blockers = others.map((detection) => toPlane(detection, originLat, originLng));

  const members: Array<Member<T>> = stalls.map((detection) => {
    const center = toPlane(detection, originLat, originLng);
    const polygon = detection.geoCorners?.length === 4
      ? detection.geoCorners.map((corner) => toPlane(corner, originLat, originLng))
      : null;
    return { detection, center, axis: polygon ? axisFromPolygon(polygon) : null };
  });

  const rebuilt = clusterRows(members).flatMap((group) => (
    group.length >= MIN_ROW_MEMBERS
      ? snapRowToLattice(group, blockers, originLat, originLng)
      : group.map((member) => member.detection)
  ));

  return [...others, ...rebuilt];
}
