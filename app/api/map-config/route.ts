import { json } from "@/lib/api";
import { parseNearmapCoverage } from "@/lib/nearmap";

const ESRI_CONFIG = {
  provider: "esri",
  tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  maxZoom: 19,
  nativeMaxZoom: 19,
  coverageStatus: "unconfigured",
  captureDate: null,
  resolutionCm: null,
  attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};

type GoogleSession = {
  session?: string;
};

type GoogleViewport = {
  copyright?: string;
  maxZoomRects?: Array<{
    maxZoom?: number;
    north?: number;
    south?: number;
    east?: number;
    west?: number;
  }>;
};

async function googleMapConfig(apiKey: string, lat: number, lng: number) {
  const sessionResponse = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType: "satellite", language: "en-US", region: "US" }),
    cache: "no-store",
  });
  if (!sessionResponse.ok) throw new Error("Google Map Tiles session could not be created.");

  const session = (await sessionResponse.json() as GoogleSession).session;
  if (!session) throw new Error("Google Map Tiles returned an invalid session.");

  let attribution = "Google Maps";
  let nativeMaxZoom = 22;
  const delta = 0.01;
  try {
    const viewport = new URL("https://tile.googleapis.com/tile/v1/viewport");
    viewport.searchParams.set("session", session);
    viewport.searchParams.set("key", apiKey);
    viewport.searchParams.set("zoom", "20");
    viewport.searchParams.set("north", String(Math.min(90, lat + delta)));
    viewport.searchParams.set("south", String(Math.max(-90, lat - delta)));
    viewport.searchParams.set("east", String(Math.min(180, lng + delta)));
    viewport.searchParams.set("west", String(Math.max(-180, lng - delta)));
    const viewportResponse = await fetch(viewport, { cache: "no-store" });
    if (viewportResponse.ok) {
      const viewportInfo = await viewportResponse.json() as GoogleViewport;
      const copyright = viewportInfo.copyright?.trim();
      if (copyright) attribution = `Google Maps · ${copyright}`;
      const availableZooms = viewportInfo.maxZoomRects?.filter((rectangle) =>
        typeof rectangle.maxZoom === "number" && typeof rectangle.north === "number" && typeof rectangle.south === "number" && typeof rectangle.east === "number" && typeof rectangle.west === "number" &&
        lat <= rectangle.north && lat >= rectangle.south && lng <= rectangle.east && lng >= rectangle.west
      ).map((rectangle) => rectangle.maxZoom as number);
      if (availableZooms?.length) nativeMaxZoom = Math.min(22, Math.max(...availableZooms));
    }
  } catch { /* Google Maps text attribution remains visible if viewport metadata is unavailable. */ }

  return {
    provider: "google",
    tileUrl: `/api/google-map-tiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}`,
    maxZoom: nativeMaxZoom,
    nativeMaxZoom,
    coverageStatus: "available",
    captureDate: null,
    resolutionCm: null,
    attribution,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLat = url.searchParams.get("lat");
  const rawLng = url.searchParams.get("lng");
  const parsedLat = Number(rawLat);
  const parsedLng = Number(rawLng);
  const hasPoint = rawLat !== null && rawLng !== null && Number.isFinite(parsedLat) && Number.isFinite(parsedLng) && parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;
  const lat = hasPoint ? parsedLat : 32.7157;
  const lng = hasPoint ? parsedLng : -117.1611;

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleApiKey) {
    try {
      return json(await googleMapConfig(googleApiKey, lat, lng));
    } catch { /* Keep the current imagery provider available until Google is correctly configured. */ }
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (mapboxToken) {
    return json({
      provider: "mapbox",
      tileUrl: "/api/mapbox-tiles/{z}/{x}/{y}",
      maxZoom: 22,
      nativeMaxZoom: 22,
      coverageStatus: "available",
      captureDate: null,
      resolutionCm: null,
      attribution: "Imagery © Mapbox",
    });
  }

  const apiKey = process.env.NEARMAP_API_KEY?.trim();
  if (!apiKey) return json(ESRI_CONFIG);

  if (!hasPoint) {
    return json({
      provider: "nearmap",
      tileUrl: "/api/map-tiles/{z}/{x}/{y}",
      maxZoom: 21,
      nativeMaxZoom: null,
      coverageStatus: "unchecked",
      captureDate: null,
      resolutionCm: null,
      attribution: "Aerial imagery © Nearmap",
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
      nativeMaxZoom: survey.maxZoom,
      coverageStatus: "available",
      captureDate: survey.captureDate,
      resolutionCm: survey.pixelSize === null ? null : Math.round(survey.pixelSize * 1000) / 10,
      attribution: "Aerial imagery © Nearmap",
    });
  } catch {
    return json({ ...ESRI_CONFIG, coverageStatus: "error" });
  }
}
