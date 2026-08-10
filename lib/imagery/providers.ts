import type { ImageryProvider, LicenseFlags } from "@/lib/imagery/types";
import { webMercatorNominalMetersPerPx } from "@/lib/imagery/types";

const REVIEWED_AT = "2026-08-10";

function webProvider({ id, license, maxZoom, attribution, tileUrl }: {
  id: string;
  license: LicenseFlags;
  maxZoom: number;
  attribution: string;
  tileUrl: (z: number, x: number, y: number) => string;
}): ImageryProvider {
  return {
    id,
    license,
    maxZoom,
    attribution,
    getTileUrl: tileUrl,
    getGsdMetersPerPx(lat, zoom) {
      if (lat === undefined || zoom === undefined) throw new Error(`${id} requires latitude and zoom to compute nominal display resolution.`);
      return { metersPerPx: webMercatorNominalMetersPerPx(lat, zoom), basis: "web_mercator_nominal" };
    },
    async getCaptureDate() {
      return null;
    },
  };
}

export const googleImageryProvider = webProvider({
  id: "google",
  maxZoom: 22,
  attribution: "Google",
  tileUrl: (z, x, y) => `/api/google-map-tiles/${z}/${x}/${y}`,
  license: {
    displayOnly: true,
    automatedAnalysis: false,
    persistDerivedGeometry: false,
    persistPixels: false,
    trainModels: false,
    attributionRequired: "Google",
    sourceUrl: "https://developers.google.com/maps/documentation/tile/policies",
    reviewedAt: REVIEWED_AT,
  },
});

export const mapboxImageryProvider = webProvider({
  id: "mapbox",
  maxZoom: 22,
  attribution: "Mapbox",
  tileUrl: (z, x, y) => `/api/mapbox-tiles/${z}/${x}/${y}`,
  license: {
    displayOnly: true,
    automatedAnalysis: false,
    persistDerivedGeometry: false,
    persistPixels: false,
    trainModels: false,
    attributionRequired: "Mapbox",
    sourceUrl: "https://www.mapbox.com/legal/tos",
    reviewedAt: REVIEWED_AT,
  },
});

export const localFixtureProviderDescriptor: ImageryProvider = {
  id: "local-fixture",
  // These rights exist only because LocalFixtureProvider validates a fixture's
  // own provenance and rights manifest. Test providers do not receive rights by default.
  license: {
    displayOnly: false,
    automatedAnalysis: true,
    persistDerivedGeometry: true,
    persistPixels: true,
    trainModels: true,
    attributionRequired: null,
    sourceUrl: "see fixtures/lots/<fixture_id>/LICENSE.md",
    reviewedAt: REVIEWED_AT,
  },
  maxZoom: null,
  attribution: "",
  getGsdMetersPerPx() {
    throw new Error("Instantiate LocalFixtureProvider with a fixture id before requesting GSD.");
  },
  async getCaptureDate() {
    throw new Error("Instantiate LocalFixtureProvider with a fixture id before requesting capture date.");
  },
};

const PROVIDERS = new Map<string, ImageryProvider>([
  [googleImageryProvider.id, googleImageryProvider],
  [mapboxImageryProvider.id, mapboxImageryProvider],
  [localFixtureProviderDescriptor.id, localFixtureProviderDescriptor],
]);

export function getImageryProvider(id = process.env.IMAGERY_PROVIDER?.trim() || "google"): ImageryProvider {
  const provider = PROVIDERS.get(id);
  if (!provider) throw new Error(`Unknown imagery provider: ${id}`);
  return provider;
}

export function assertAutomatedAnalysisAllowed(provider: ImageryProvider): void {
  if (provider.license.automatedAnalysis !== true) {
    throw new Error(`Imagery provider '${provider.id}' is not licensed for automated analysis.`);
  }
}
