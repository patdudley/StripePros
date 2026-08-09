export type NearmapSurvey = {
  id: string;
  captureDate: string | null;
  pixelSize: number | null;
  maxZoom: number;
};

type CoverageTile = { type?: string; scale?: number };
type CoverageSurvey = {
  id?: string;
  captureDate?: string;
  pixelSize?: number;
  resources?: { tiles?: CoverageTile[] };
};

export function parseNearmapCoverage(payload: unknown): NearmapSurvey | null {
  if (!payload || typeof payload !== "object") return null;
  const surveys = (payload as { surveys?: CoverageSurvey[] }).surveys;
  if (!Array.isArray(surveys)) return null;

  for (const survey of surveys) {
    const vertical = survey.resources?.tiles?.find((tile) => tile.type === "Vert");
    if (!survey.id || !vertical) continue;
    const scale = Number(vertical.scale);
    const maxZoom = Number.isFinite(scale) ? Math.min(22, Math.max(18, Math.round(scale))) : 21;
    const pixelSize = Number(survey.pixelSize);
    return {
      id: survey.id,
      captureDate: typeof survey.captureDate === "string" ? survey.captureDate : null,
      pixelSize: Number.isFinite(pixelSize) ? pixelSize : null,
      maxZoom,
    };
  }
  return null;
}

export function isValidTileCoordinate(z: number, x: number, y: number) {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return false;
  const limit = 2 ** z;
  return x >= 0 && y >= 0 && x < limit && y < limit;
}

export function isValidSurveyId(value: string) {
  return /^[A-Za-z0-9-]{8,100}$/.test(value);
}

