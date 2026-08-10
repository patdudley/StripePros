import { json } from "@/lib/api";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; housenumber?: string; street?: string; district?: string; city?: string; state?: string; postcode?: string; country?: string };
};

function unique(parts: Array<string | undefined>) {
  return parts.filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
}

function baseAddress(query: string) {
  return query.replace(/(?:,?\s+)(?:#|suite\s+|ste\s+|unit\s+|apt\s+)[a-z0-9-]+(?=,|$)/i, "").replace(/\s+,/g, ",").trim();
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return json({ error: "Enter a complete address." }, 400);

  const normalizedQuery = baseAddress(query);
  const photon = new URL("https://photon.komoot.io/api");
  photon.searchParams.set("q", normalizedQuery);
  photon.searchParams.set("limit", "5");
  photon.searchParams.set("lang", "en");
  photon.searchParams.set("countrycode", "US");
  photon.searchParams.set("lat", "32.7157");
  photon.searchParams.set("lon", "-117.1611");
  photon.searchParams.set("location_bias_scale", "0.65");

  try {
    const photonResponse = await fetch(photon, { headers: { Accept: "application/json" } });
    if (photonResponse.ok) {
      const body = await photonResponse.json() as { features?: PhotonFeature[] };
      const results = (body.features ?? []).flatMap((feature) => {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties ?? {};
        if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
        const streetAddress = unique([properties.housenumber, properties.street]).join(" ");
        const primary = streetAddress || properties.name || properties.street || properties.city || "Address match";
        const secondary = unique([properties.name !== primary ? properties.name : undefined, properties.district, properties.city, properties.state, properties.postcode]).join(", ");
        return [{ label: unique([primary, secondary, properties.country]).join(", "), lat: coordinates[1], lng: coordinates[0] }];
      });
      if (results.length) return json({ results });
    }
  } catch { /* fall through to Nominatim */ }

  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("countrycodes", "us");
  endpoint.searchParams.set("q", normalizedQuery);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "StripePros/0.1 (parking-lot estimating application)",
    },
  });
  if (!response.ok) return json({ error: "Address search is temporarily unavailable." }, 502);

  const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
  return json({
    results: results.map((result) => ({
      label: result.display_name,
      lat: Number(result.lat),
      lng: Number(result.lon),
    })),
  });
}
