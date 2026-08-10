# Licensed scan fixtures

Only imagery with verified rights for automated analysis, pixel persistence, and model training may be indexed by `MANIFEST.json`.

Each fixture lives at `lots/<fixture_id>/` and must contain `meta.json`, `LICENSE.md`, and one supported `image.*` raster. Ambiguous sources belong in `quarantine/` and must not appear in the manifest.
