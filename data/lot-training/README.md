# Lot counting training loop

This dataset separates quote facts from aerial observations. A proposal is not automatically a full-parcel stall label: some jobs cover only ADA corrections, entrance markings, or a subset of a large property.

## Counting protocol

1. Geocode the exact address and confirm the named business or property.
2. Draw or record the intended work boundary before counting anything.
3. Classify the job as whole-lot, partial-scope, or boundary-ambiguous.
4. Count row by row. For each row, use visible divider lines, occupied vehicles, wheel stops, and row endpoints together.
5. Record standard stalls, ADA stalls, access aisles/crosshatch, pedestrian paths, fire lanes, arrows, stop bars, curbs, speed bumps, and stencils as separate classes.
6. Never convert a painted-line quantity into a stall quantity without layout geometry. A row of N adjacent stalls commonly uses N+1 boundary lines, and double-line layouts behave differently.
7. Save confidence and the reason for uncertainty. If the boundary is not defensible, return `needs_boundary` instead of a made-up count.
8. For evaluation, enter the prediction before opening the quote label and set `blind: true`.

## Evaluation

Run `pnpm evaluate:lots`. The report scores only blind predictions on records explicitly eligible for whole-lot evaluation. Calibration predictions and partial-scope jobs are listed but excluded from accuracy metrics.

The current Google Building 41 proposal is a rejection test: the address does not select one parking lot, so the correct behavior is to request a boundary rather than reuse demo counts.

## August 9, 2026 practice audit

The supplied folder contains 20 files covering 14 unique parking-lot addresses, one sports-court job, and one generated demo proposal. Only five proposals contain a comparable whole-lot stall label. One of those five has an ambiguous property boundary, leaving four usable calibration examples. The other proposals are duplicates, lump-sum scopes without quantities, partial ADA/marking packages, or non-parking work.

These labels and the earlier calibration predictions have already been opened in this repository, so they cannot honestly be renamed as blind tests. The evaluator therefore requires at least ten genuinely unseen, independently labeled whole-lot examples before it reports the benchmark as ready. Until then, the practice set is useful for workflow calibration and rejection behavior, not as proof of automatic-count accuracy or model training.

The imagery review produced three durable rules:

1. Confirm the property and require a lot boundary before running any marking count.
2. Separate whole-lot counts from partial proposal scope; a four-stall work order on a large storage property is not a four-stall parking lot.
3. Treat image-derived counts as an editable draft. Never send a quote directly from an unverified scan.

See `practice-audit-2026-08-09.json` for the disposition of every unique address.
