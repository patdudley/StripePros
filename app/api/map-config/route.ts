import { json } from "@/lib/api";
import { parseNearmapCoverage } from "@/lib/nearmap";

const ESRI_CONFIG = {
  provider: "esri",
  tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  maxZoom: 19,
  coverageStatus: "unconfigured",
  captureDate: null,
  resolutionCm: null,
};

export async function GET(request: Request) {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (mapboxToken) {
    return json({
      provider: "mapbox",
      tileUrl: "/api/mapbox-tiles/{z}/{x}/{y}",
      maxZoom: 21,
      coverageStatus: "available",
      captureDate: null,
      resolutionCm: null,
    });
  }

  const apiKey = process.env.NEARMAP_API_KEY?.trim();
  if (!apiKey) return json(ESRI_CONFIG);

  const url = new URL(request.url);
  const rawLat = url.searchParams.get("lat");
  const rawLng = url.searchParams.get("lng");
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const hasPoint = rawLat !== null && rawLng !== null && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  if (!hasPoint) {
    return json({
      provider: "nearmap",
      tileUrl: "/api/map-tiles/{z}/{x}/{y}",
      maxZoom: 21,
      coverageStatus: "unchecked",
      captureDate: null,
      resolutionCm: null,
    });
  }

  try {
    const coverage = await fetch(`https://api.nearmap.com/coverage/v2/point/${lng},${lat}?limit=5`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (!coverage.ok) return json({ ...ESRI_CONFIG, coverageStatus: "error" });
    const survey = parseNearmapCoverage(await coverage.json());
    if (!survey) return json({ ...ESRI_CONFIG, coverageStatus: "unavailable" });
    return json({
      provider: "nearmap",
      tileUrl: `/api/map-tiles/{z}/{x}/{y}?surveyId=${encodeURIComponent(survey.id)}`,
      maxZoom: survey.maxZoom,
      coverageStatus: "available",
      captureDate: survey.captureDate,
      resolutionCm: survey.pixelSize === null ? null : Math.round(survey.pixelSize * 1000) / 10,
    });
  } catch {
    return json({ ...ESRI_CONFIG, coverageStatus: "error" });
  }
}
