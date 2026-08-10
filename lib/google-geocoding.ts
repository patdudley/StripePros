type GoogleGeocodeResult = {
  formatted_address?: string;
  partial_match?: boolean;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

const EXACT_ADDRESS_TYPES = new Set(["street_address", "premise", "subpremise", "establishment", "point_of_interest"]);
const REJECTED_TYPES = new Set(["intersection", "route"]);

export type ExactAddressResult = {
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lng: number;
  provider: "google";
};

export async function findExactGoogleAddresses(query: string): Promise<ExactAddressResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new Error("Google address search is not configured.");

  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  endpoint.searchParams.set("address", query);
  endpoint.searchParams.set("components", "country:US");
  endpoint.searchParams.set("region", "us");
  endpoint.searchParams.set("key", apiKey);

  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Google address search is temporarily unavailable.");
  const body = await response.json() as GoogleGeocodeResponse;
  if (body.status === "ZERO_RESULTS") return [];
  if (body.status !== "OK") throw new Error(body.error_message?.slice(0, 180) || "Google Geocoding API must be enabled for this key.");

  return (body.results ?? []).flatMap((result) => {
    const types = result.types ?? [];
    const location = result.geometry?.location;
    const label = result.formatted_address?.trim();
    if (!label || !location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    if (result.partial_match || types.some((type) => REJECTED_TYPES.has(type)) || !types.some((type) => EXACT_ADDRESS_TYPES.has(type))) return [];
    const [primary = label, ...secondaryParts] = label.split(",").map((part) => part.trim());
    return [{ label, primary, secondary: secondaryParts.join(", "), lat: Number(location.lat), lng: Number(location.lng), provider: "google" as const }];
  }).slice(0, 5);
}
