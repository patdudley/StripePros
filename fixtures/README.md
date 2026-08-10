# Licensed scan fixtures

Only imagery with verified rights for automated analysis, pixel persistence, and model training may be indexed by `MANIFEST.json`.

Each fixture lives at `lots/<fixture_id>/` and must contain `meta.json`, `LICENSE.md`, and one supported `image.*` raster. Ambiguous sources belong in `quarantine/` and must not appear in the manifest.

Acquire a verified fixture with `pnpm fetch:fixture -- --source indiana --id <fixture-id> --bbox <west,south,east,north>`. Supported sources are USGS NAIP, Indiana CC0 orthoimagery, and a generic ArcGIS ImageServer adapter. Generic services are quarantined unless the command receives an exact license name, URL, excerpt, and `--rights-confirmed true`. USGS NAIP Plus is a mixed catalog, so its fixtures are indexed only when the selected raster identifies USDA or USGS as its source.

Texas's current statewide 6-inch imagery service is intentionally not included: it is governed by a restricted Hexagon subscription license, not public-domain terms.
