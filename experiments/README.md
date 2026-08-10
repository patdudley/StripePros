# Licensed resolution experiment

This experiment compares the unchanged scanner on the same ten lots at 60 cm and 15 cm. A licensed 7.5 cm tier remains pending a Vexcel evaluation source. Google and Mapbox imagery must never be used here.

## Prepare the fixtures

```sh
pnpm experiment:prepare-resolution
```

The acquisition script writes a CC0 `LICENSE.md`, source metadata, and a native-resolution raster for every Indiana fixture. A source that cannot prove analysis and persistence rights must not enter `fixtures/lots`.

## Ground truth

Each fixture must contain a founder-confirmed `truth.geojson`, labeled directly on its native 15 cm `image.png`. Model output is not ground truth. Each feature must be a polygon with one of these exact classes:

- `standard_stall`
- `ada_stall`
- `arrow`
- `stop_bar`

The same truth polygons are reused unchanged for every resolution tier. Do not label from Google imagery or copy any historical Google-derived annotations.

## Run

Supply the secret through the process environment; never commit it. The runner pins the official standard short-context rates in effect for the pipeline's `gpt-5.6` model when this experiment version was committed.

```sh
IMAGERY_PROVIDER=local-fixture \
AI_SCANNING_ENABLED=true \
OPENAI_API_KEY="$OPENAI_API_KEY" \
pnpm experiment:resolution
```

The runner writes `experiments/resolution-tiers.md`. Failed or timed-out scans remain in the denominator as complete misses and retain their cost and latency; they are never silently dropped.
