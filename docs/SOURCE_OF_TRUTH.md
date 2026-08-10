# StripePros Source of Truth

Status: Gate 0 audit complete on 2026-08-10. No scanner feature code was changed.

## Decision

The canonical source is GitHub `patdudley/StripePros`, branch `main`, at commit `a306565520e1a0790446d1f02c25895fcf0b32cb` or a later commit that has passed the required build, tests, and deployment checks. The audited baseline is permanently tagged `baseline-v63`.

The current live Sites version is version 63. Its recorded source commit is exactly `a306565520e1a0790446d1f02c25895fcf0b32cb`. Local `HEAD`, GitHub `origin/main`, the Sites source repository `main`, and the live version therefore agree at the source level.

## Live deployment inventory

| Item | Observed value |
|---|---|
| Production URL | `https://stripe-pros.patduds.chatgpt.site` |
| Hosting | OpenAI Sites on Cloudflare Workers-compatible output |
| Sites project | `Stripe Pros` / slug `stripe-pros` |
| Live Sites version | 63 |
| Live source commit | `a306565520e1a0790446d1f02c25895fcf0b32cb` |
| Sites source branch | `main` |
| GitHub canonical branch | `main` |
| GitHub `origin/main` | `a306565520e1a0790446d1f02c25895fcf0b32cb` |
| Immutable baseline tag | `baseline-v63` → `a306565520e1a0790446d1f02c25895fcf0b32cb` |
| Build command | `npm run build` → `vinext build` |
| Runtime | Cloudflare Worker-compatible ESM produced by vinext/Vite |
| Access | Custom/owner-only Sites access at audit time |
| D1 | One Sites-managed D1 database bound as `DB`; local logical database name is `site-creator-d1` |
| R2 | None (`r2: null`) |
| KV | None declared or bound |
| Queues | None declared or bound |
| Production archive | 160 files, 5,519,360 bytes, SHA-256 `9f789d99922b69f6f4aa4a12726227ac8ca15fd3814025556f11ff9c1f1c9e9d` |

The physical D1 resource identifier is managed by Sites and is not exposed by the project configuration/API used for this audit. The application binding is unambiguously `DB`.

### Production runtime variables

Only names and configuration state are recorded here. Secret values must never be committed.

| Variable | State | Purpose |
|---|---|---|
| `FOUNDER_EMAIL` | configured, non-secret | Founder route authorization |
| `GITHUB_REPOSITORY` | configured, non-secret | Founder HQ GitHub activity |
| `GOOGLE_CALENDAR_TOKEN_KEY` | configured, secret | Calendar token encryption |
| `GOOGLE_MAPS_API_KEY` | configured, secret | Google Map Tiles and address services |
| `INTEGRATION_TOKEN_KEY` | configured, secret | Integration token encryption |
| `MAPBOX_ACCESS_TOKEN` | configured, secret | Imagery fallback |
| `OPENAI_API_KEY` | configured, secret | Vision scan calls |

No production `NEARMAP_API_KEY` is configured in Sites.

### Imagery and vision provider actually selected

`app/api/map-config/route.ts` selects imagery in this order: Google → Mapbox → Nearmap → Esri. Because `GOOGLE_MAPS_API_KEY` is configured, production selects Google satellite imagery whenever Google session creation succeeds. Mapbox is the configured fallback. Nearmap is not configured in production, and Esri is the final uncredentialed fallback.

The scan endpoint sends clean multi-crop captures to OpenAI model `gpt-5.6` with low reasoning effort. The model identifier is currently hard-coded in `app/api/scan-lot/route.ts` rather than versioned in configuration.

## Deployment pipeline

The current deployment can be reconstructed from Sites source provenance, the repository scripts, and the saved production archive:

1. Work is committed to GitHub `patdudley/StripePros` on `main`.
2. The exact same commit is pushed to the Sites-managed source repository on its `main` branch.
3. `npm run build` runs the vinext production build.
4. The build output, `.openai/hosting.json`, and any migrations are packaged into the Sites archive.
5. A Sites version is saved with the pushed `commit_sha`.
6. That saved version is deployed to the production Sites target.
7. Deployment status is checked before the live URL is treated as current.

Going forward, a deployment is valid only if all three commit references match: local release commit, GitHub `origin/main`, and the Sites saved version's `source.commit_sha`.

## Repo versus production divergence audit

The Sites API records source provenance rather than exposing a downloadable source tree. The live version's recorded commit equals `HEAD`, so the source-level diff is empty. The production archive hash above is retained as the immutable bundle identity. Local file hashes also match the corresponding files in `HEAD`.

| Surface | Repository / HEAD | Production version 63 | Correct state | Reconciliation |
|---|---|---|---|---|
| `lib/scan-corrections/store.ts` | Present; SHA-256 `a2f5f457a06f32c42946ab58b9f5250bae76ebf7e5cd24e3cbef1d953dcd5583` | Same source commit as HEAD | Current repo version | None for Gate 0 |
| `app/api/scan-lot/route.ts` | Present; SHA-256 `224cb916aa0bb206d68c8b1d90bbaf805998c256ae4db6df5d9d1ea0113efd66` | Same source commit as HEAD | Current repo version | None for Gate 0 |
| Scanner crop capture | Both homepage and workspace import `captureLotScanSections` | Same source commit as HEAD | Shared capture helper | Preserve and move behind a single scanner client in M1 |
| Scanner API | Both homepage and workspace call `POST /api/scan-lot` | Same source commit as HEAD | Shared server endpoint | Preserve |
| Homepage scanner UI | Implemented separately in `app/stripe-pros-app.tsx` | Same source commit as HEAD | Not acceptable as the long-term scanner client | Replace duplicated orchestration with one shared scanner module/component in M1 |
| Workspace scanner UI | Implemented separately in `app/workspace/credible-takeoff-workspace.tsx` | Same source commit as HEAD | Use its correction-aware behavior as input to the shared scanner | Extract shared behavior in M1; do not maintain a second implementation |
| Correction persistence | Workspace posts model edits/deletes to `/api/scan-corrections`; homepage does not | Same behavior in production | Incomplete | Unify scan/correction capture in M1. Anonymous homepage interactions may be recorded as unverified events but must never become ground truth |
| Manual additions | API/store accept `manual_added`, but current clients do not submit complete manual-add learning events | Same behavior in production | Incomplete | Capture through the shared correction client in M1/M2 |
| Founder verification | Workspace has a UI checkbox for export readiness, but there is no atomic verified-takeoff truth write | Same behavior in production | Incomplete | Build the explicit verified-takeoff transaction in M2 |
| R2 crop persistence | No R2 binding | No R2 binding | Blocking for reconstructible scan artifacts | Add only after the imagery-license gate is documented |

## Important conclusion

There is no GitHub-versus-production source conflict at the audited release. The real divergence is architectural: the product has one scan API and one crop helper, but two independently implemented scanner clients, and only the workspace client records a subset of corrections. This explains why some founder feedback is invisible to later scans even though production and GitHub match.

## Reconciliation plan

This is a plan only; Gate 0 makes no implementation changes.

1. Keep `main` as the canonical branch and version 63 / commit `a306565...` as the audited baseline.
2. In M1, introduce one shared scanner orchestration module used by both homepage and workspace. It must own crop capture, request construction, scan result normalization, scan IDs, progress, failure handling, and correction event submission.
3. Persist all scan runs from both surfaces to the same D1 database. Preserve `source = homepage | workspace` so results remain segmentable.
4. Do not treat anonymous homepage edits as verified truth. Only the authenticated founder's explicit M2 verification action may write `verified_takeoffs` and `verified_markings`.
5. Replace the current partial `scan_corrections` learning path with the append-only M1/M2 schema after migrations and compatibility handling are designed. Do not overwrite the existing table or historical rows.
6. Add R2 only after `docs/IMAGERY_LICENSE.md` confirms that the active provider permits the intended crop storage and training uses.
7. Add a release check that compares the Sites version commit with GitHub `origin/main` before and after deployment.

## Open questions / decisions

No unresolved production-versus-repository divergence requires a founder decision: the source commits are identical, and the required one-scanner direction determines how to reconcile the client fork.

Before M1 implementation begins, Gate 0 still requires the founder's explicit go/no-go confirmation to adopt this audited baseline and reconciliation plan.
