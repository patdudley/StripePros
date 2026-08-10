# Imagery call-site audit

Reviewed: 2026-08-10
Baseline: `baseline-v63` (`a306565`)

## Automated analysis — suspended

| Call site | Role | Enforcement |
|---|---|---|
| `lib/lot-scan-capture.ts` | Captures clean browser-rendered map sections as JPEG data URLs. | Both clients are gated by `AI_SCANNING_ENABLED`; it cannot reach a model while disabled. |
| `app/stripe-pros-app.tsx` | Homepage boundary flow captures sections and posts them to `/api/scan-lot`. | Does not enter the scanning phase while disabled; directs the user to manual takeoff. |
| `app/workspace/credible-takeoff-workspace.tsx` | Workspace boundary flow captures sections and posts them to `/api/scan-lot`. | Does not schedule or run the scan while disabled; manual tools remain available. |
| `app/api/scan-lot/route.ts` | Sends imagery bytes to the OpenAI Responses API. | The first handler statement returns `503 SCANNING_SUSPENDED` unless explicitly enabled. No request parsing, tile fetch, or model call occurs first. |

No other code path that sends imagery bytes to a model was found.

## Display only — remains enabled

| Call site | Role |
|---|---|
| `app/api/map-config/route.ts` | Selects a configured basemap and returns display configuration. |
| `app/api/google-map-tiles/[z]/[x]/[y]/route.ts` | Proxies authenticated Google Map Tiles for display. |
| `app/api/mapbox-tiles/[z]/[x]/[y]/route.ts` | Proxies Mapbox raster tiles for display fallback. |
| `app/api/map-tiles/[z]/[x]/[y]/route.ts` | Proxies configured Nearmap imagery for display fallback. |
| `lib/map-imagery.ts` | Activates the selected Leaflet basemap and required attribution. |

`app/workspace/credible-takeoff-workspace.tsx` also captures the annotated map into a user-downloaded proposal PDF. It does **not** send the image to a model, so it is outside this automated-analysis shutoff; its document-export rights still need provider-specific license review before commercial reliance.

## Quarantine finding

Production has no persisted `detections` table to backfill. The reusable D1 artifact is `scan_corrections`, whose historical rows did not record an imagery provider. Those rows are therefore conservatively marked `tainted_unlicensed`, and the correction-example query only returns rows explicitly marked `eligible`. The system cannot truthfully distinguish historical Google rows from historical Mapbox rows without provenance that was never recorded.
