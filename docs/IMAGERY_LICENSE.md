# StripePros Imagery License Gate

Status: **BLOCKED for automated scanning with the current Google imagery source.**  
Reviewed: 2026-08-10. This is an engineering compliance review, not legal advice.

## Decision summary

StripePros must not persist Google or Mapbox aerial pixels in D1 or R2 under the current standard API arrangements. More importantly, Google Map Tiles may not be used for the scanner's image-analysis/object-detection workflow even transiently.

The approved M1 storage shape is therefore **Path A for data architecture**:

- Persist boundary geometry, crop recipes, GSD, model request metadata, raw model text responses, parsed detections, costs, latency, and warnings.
- Keep `scan_crops.r2_key` nullable.
- Do not persist provider pixels.
- Use R2 only for StripePros-owned eval reports, rendered vector overlays, and other assets that contain no provider imagery.

Path A does **not** make the current Google-powered scanner compliant. A provider that expressly licenses automated analysis is still required before the production scanner can continue using third-party aerial pixels as model input.

## How production currently fetches imagery

Production does **not** use the unauthenticated `mt0`–`mt3.google.com` endpoints.

`app/api/map-config/route.ts` uses the configured `GOOGLE_MAPS_API_KEY` to call:

- `POST https://tile.googleapis.com/v1/createSession`
- `GET https://tile.googleapis.com/tile/v1/viewport`

`app/api/google-map-tiles/[z]/[x]/[y]/route.ts` then proxies:

- `GET https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}`

The browser renders those authenticated Google Map Tiles through Leaflet. `lib/lot-scan-capture.ts` captures the rendered map into JPEG crops, and `POST /api/scan-lot` sends those crops to OpenAI for automated detection.

That is an authenticated Google Maps Platform implementation, not an unofficial tile scrape. It is nevertheless outside the published permitted Map Tiles use because the crops are used for machine analysis.

## Google Maps Platform

### Official sources

- [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms)
- [Google Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)

### Findings

The Map Tiles policy says: “You may not use Map Tiles API for any non-visualization use cases” and explicitly lists image analysis, machine interpretation, and object detection.

The platform terms separately prohibit caching except where service-specific terms allow it, prohibit extracting Google Maps Content for use outside the service, and prohibit using Google Maps Content to improve AI/ML models.

| Proposed use | Standard Google Map Tiles position | StripePros decision |
|---|---|---|
| Interactive satellite display with attribution | Permitted subject to the agreement and policy | May remain display-only |
| Transient screenshot sent to a VLM for counting | Explicitly listed as a prohibited non-visualization use | **Do not use** |
| Permanent crop storage in R2 | Prohibited absent a narrow service-specific exception | **Do not build** |
| Re-fetching the same tiles for offline benchmark analysis | Still image analysis/offline use | **Do not use** |
| Training, testing, validation, or fine-tuning | Prohibited | **Do not use** |
| Derived boundary coordinates supplied by the customer | Not Google imagery content when independently supplied | Store |
| Detection polygons produced by StripePros | Store only after counsel/provider confirmation that they are sufficiently independent derived output | Treat as allowed for M1, but do not represent them as Google data |

## Mapbox

### Official sources

- [Mapbox Terms of Service](https://www.mapbox.com/legal/tos)
- [Mapbox Raster Tiles API](https://docs.mapbox.com/api/maps/raster-tiles/)

### Findings

The standard Raster Tiles API documents a “device cache TTL of 12 hours and a CDN cache TTL of 5 minutes.” The public terms also require customers to destroy downloaded service content after termination. The standard public materials reviewed do not grant an express right to build a permanent imagery corpus or train a third-party detector on Mapbox Satellite.

Mapbox also states that certain production analytics/business-intelligence applications require a separate commercial license. StripePros is a commercial measurement and quoting application, so standard self-serve terms are not a defensible basis for permanent storage or model training.

| Proposed use | Public self-serve terms | StripePros decision |
|---|---|---|
| Interactive satellite display | Available through the Raster Tiles API | Permitted as fallback display |
| Short HTTP/device caching | Governed by response TTL | Browser/network cache only |
| Permanent R2 crop corpus | No express permission found | **Do not build** |
| Automated commercial image analysis | Not clearly granted in reviewed public terms | Require written Mapbox approval/order before use |
| Training or fine-tuning | No express permission found | **Do not use without a negotiated license** |

## Does M1 need to store imagery?

No. M1 can reconstruct the **request recipe and derived result** without storing pixels:

- provider
- tile/API product
- crop bounding box
- Web Mercator zoom
- pixel dimensions
- device pixel ratio
- rotation
- overlap
- boundary GeoJSON
- imagery capture date when supplied
- computed GSD
- pipeline version
- model request without image bytes
- verbatim model response
- parsed/merged detections

Re-fetching may produce different pixels later because providers update imagery. Therefore Path A provides reproducible recipes and auditable outputs, but not byte-identical image reproduction. M1 acceptance must say this explicitly.

## GSD under Path A

For Web Mercator imagery, store the nominal ground resolution at the crop center:

```text
gsd_m_per_px = 156543.03392 × cos(latitude_radians) / 2^zoom
```

This is a geometric property of the Web Mercator tile grid, not extracted imagery content. Store the zoom and center latitude alongside the calculated value. If a high-DPI tile or client-side pixel ratio is used, also store the source tile size and rendered pixel ratio so downstream metric calculations do not confuse CSS pixels, captured pixels, and source pixels.

## R2 policy

R2 may be provisioned for StripePros-owned artifacts only:

- Markdown/JSON/HTML eval reports
- Vector-only overlays and diagrams rendered without provider imagery
- CSV exports and metric summaries
- Future imagery from a provider whose executed license permits storage

R2 must not receive Google or Mapbox tiles, screenshots, crops, or composites under the current arrangements.

## Provider gate for production analysis

Before automated scanning continues on an imagery provider, StripePros needs written terms that expressly permit:

1. automated computer-vision/VLM analysis;
2. creation and storage of derived detections and measurement geometry;
3. temporary processing by OpenAI or another model subprocessor;
4. optional storage of source crops for evaluation; and
5. optional training/validation/fine-tuning, if Phase 6 is ever pursued.

Nearmap, Vexcel, EagleView, or another commercial aerial provider may satisfy these requirements under a negotiated order, but no provider is approved until the executed terms are reviewed against all five uses.

## Blocking question

Choose the source for automated scanning before M1 scanner work proceeds:

- negotiate a commercial imagery license that permits automated analysis; or
- temporarily disable automated scanning and keep Google/Mapbox display-only while StripePros builds the derived-data persistence and manual takeoff benchmark.

The current Google Map Tiles → JPEG capture → OpenAI detection path should not be treated as production-compliant.
