import { json } from "@/lib/api";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

function unique(parts: Array<string | undefined>) {
  return parts.filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
}

function baseAddress(query: string) {
  return query.replace(/(?:,?\s+)(?:#|suite\s+|ste\s+|unit\s+|apt\s+)[a-z0-9-]+(?=,|$)/i, "").replace(/\s+,/g, ",").trim();
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return json({ results: [] });

  const endpoint = new URL("https://photon.komoot.io/api");
  endpoint.searchParams.set("q", baseAddress(query));
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("countrycode", "US");
  endpoint.searchParams.set("lat", "32.7157");
  endpoint.searchParams.set("lon", "-117.1611");
  endpoint.searchParams.set("location_bias_scale", "0.65");

  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) return json({ results: [] });

  const body = await response.json() as { features?: PhotonFeature[] };
  const results = (body.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties ?? {};
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];

    const streetAddress = unique([properties.housenumber, properties.street]).join(" ");
    const primary = streetAddress || properties.name || properties.street || properties.city || "Address match";
    const secondary = unique([properties.name !== primary ? properties.name : undefined, properties.district, properties.city, properties.state, properties.postcode]).join(", ");
    const label = unique([primary, secondary, properties.country]).join(", ");
    return [{ label, primary, secondary, lat: coordinates[1], lng: coordinates[0] }];
  });

  const deduplicated = Array.from(new Map(results.map((result) => [result.label, result])).values()).slice(0, 5);
  return json({ results: deduplicated });
}
