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
