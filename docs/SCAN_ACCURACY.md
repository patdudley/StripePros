# Lot scan accuracy architecture

## The core principle

A vision model is good at deciding **what a patch of pavement is**. It is unreliable at
**counting** and at **metric geometry**, because counting requires holding an ordered ledger
across a large image and geometry requires consistent scale. Every miscount observed in the
field has come from asking the model to do the second job.

The pipeline therefore splits the work:

| Layer | Owner | Responsibility |
|---|---|---|
| Perception | `gpt-5.6` vision passes | Classify markings, place approximate corners |
| Reconciliation | `mergeOverlappingDetections` | Remove the same space seen in two crops |
| Exclusion | `suppressTrafficLaneStalls` | Delete rectangles covering traffic lanes |
| Counting | `reconstructRowLattice` | Decide how many spaces a row contains |

Counting is deterministic. The model never returns the final number.

## Why a row lattice

A parking row is a one-dimensional periodic structure. Every space in a row shares one axis,
one pitch (~9 ft), and one depth (~18 ft), and the spaces are contiguous between the row's two
endpoints. That regularity is a strong constraint the model does not exploit on its own.

`lib/lot-rows.ts` recovers it:

1. **Axis prior.** A stall rectangle is wider than it is deep in the direction the row runs, so
   the row axis is the rectangle's short edge. This beats principal-component fitting on short
   rows, where a handful of points can fit a line in the wrong direction.
2. **Clustering.** Detections within 9 ft perpendicular of a shared axis form one row.
3. **Pitch estimation.** The median of the gaps along the axis, ignoring gaps under a stall
   width. Duplicate boxes for one space produce near-zero gaps and would otherwise destroy the
   median.
4. **Snapping.** Each detection maps to `round((position - base) / pitch)`. Two rectangles that
   land in one cell are one space. This fixes double counting structurally rather than by
   tuning an overlap threshold.
5. **Interpolation.** An empty cell between two occupied cells is a space the model skipped, so
   it is filled by translating a neighbour's rectangle along the axis.

## Guards against over-filling

Interpolation can only invent spaces, so it is deliberately conservative:

- a row needs at least 4 occupied cells before its pitch is trusted
- at most 2 consecutive cells are bridged, and at most 3 per row
- a gap containing an arrow, aisle, crosswalk, or speed bump is treated as a real break in the
  row rather than a missing space
- filled spaces are returned as `partially_supported`, so they render dashed and read as
  "confirm this one" rather than as a verified count

The wide break between two separate parking fields is left alone because it exceeds the
consecutive-cell limit.

## Traffic lanes are not parking

Pavement that carries moving vehicles cannot also be a parking space. A rectangle containing an
arrow or a channelizing stripe is lane pavement, so `suppressTrafficLaneStalls` removes it by
point-in-polygon test. This is a geometric fact rather than a prompt instruction, which is why
drive-through lanes stopped being counted as spaces.

## Error asymmetry

A missing stall is invisible to the estimator; an extra marker is one click to remove. The
confidence gate reflects that: a `partially_supported` slot counts from 0.42 confidence rather
than requiring a boundary-edge row id. Bias toward showing a reviewable marker.

## Improving accuracy further

In rough order of expected value:

1. **Blind evaluation set.** `data/lot-training/` needs 10 or more independently labelled
   whole-lot properties before any accuracy claim is defensible. `practice-audit-2026-08-09.json`
   records why the current examples cannot serve as holdouts: their labels were already opened.
   Without this, every change is judged on single anecdotes.
2. **Per-class metrics.** Track precision and recall separately for stalls, ADA, arrows, lane
   lines, and crosswalks. A single "markings counted" number hides which class regressed.
3. **Correction feedback.** `lib/scan-corrections/store.ts` already records founder edits, and
   `loadCorrectionExamples` feeds recent ones back as few-shot behavioural examples. Only the
   workspace submits corrections today; the homepage does not. Unifying the two scanner clients
   would roughly double the signal.
4. **Geometry from the boundary.** The user's outline plus known stall dimensions constrains how
   many spaces can physically fit along an edge. That is an unused upper bound.
5. **Licensed imagery.** Fine-tuning on aerial pixels is blocked by `docs/IMAGERY_LICENSE.md`.
   Until a provider licenses automated analysis and training, accuracy work must stay in the
   prompt, the deterministic layers, and few-shot corrections. This is the hard ceiling on the
   current approach.

Note that steps 1 and 2 are measurement, not modelling. They come first because the pipeline
currently has no way to prove a change helped.
