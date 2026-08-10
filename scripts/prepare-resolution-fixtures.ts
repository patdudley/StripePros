import { readFile } from "node:fs/promises";
import { fetchFixture } from "../lib/imagery/fixture-acquisition";
import type { BBox } from "../lib/imagery/types";

type Config = { lots: Array<{ fixture_id: string; bbox: BBox; profile: string[] }> };
const config = JSON.parse(await readFile(new URL("../experiments/resolution-lots.json", import.meta.url), "utf8")) as Config;

for (const [index, lot] of config.lots.entries()) {
  const result = await fetchFixture({
    fixtureId: lot.fixture_id,
    bbox: lot.bbox,
    source: "indiana",
    targetGsdM: 0.1524,
    lotProfile: lot.profile,
  });
  if (result.quarantined) throw new Error(`${lot.fixture_id} was unexpectedly quarantined.`);
  if (result.sourceGsdM === null || result.sourceGsdM > 0.16) throw new Error(`${lot.fixture_id} is not covered by detection-grade 15 cm or better source imagery.`);
  console.log(`[${index + 1}/${config.lots.length}] ${lot.fixture_id}: source ${result.sourceGsdM.toFixed(4)} m/px, capture ${result.captureDate ?? "unknown"}`);
}
