import { fetchFixture, type FixtureSource } from "../lib/imagery/fixture-acquisition";
import type { BBox } from "../lib/imagery/types";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function parseBbox(value: string): BBox {
  const values = value.split(",").map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite)) throw new Error("--bbox must be west,south,east,north.");
  return values as BBox;
}

const source = required("source") as FixtureSource;
if (!(["naip", "indiana", "arcgis"] as string[]).includes(source)) throw new Error("--source must be naip, indiana, or arcgis.");
const result = await fetchFixture({
  fixtureId: required("id"),
  bbox: parseBbox(required("bbox")),
  source,
  serviceUrl: option("service-url"),
  targetGsdM: option("target-gsd-m") ? Number(option("target-gsd-m")) : undefined,
  lotProfile: option("profile")?.split(",").map((value) => value.trim()).filter(Boolean),
  license: source === "arcgis" ? {
    name: option("license-name") ?? "Unverified",
    url: option("license-url") ?? (option("service-url") ?? ""),
    excerpt: option("license-excerpt") ?? "",
    verified: option("rights-confirmed") === "true",
  } : undefined,
});

console.log(JSON.stringify(result, null, 2));
if (result.quarantined) {
  console.error("Fixture was quarantined because its analysis/persistence rights were not verified.");
  process.exitCode = 2;
}
