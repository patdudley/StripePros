import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync(new URL("../lib/scan-corrections/store.ts", import.meta.url), "utf8");

describe("legacy scan correction quarantine", () => {
  it("marks legacy and new unlicensed-image corrections as tainted", () => {
    expect(storeSource).toContain("DEFAULT 'tainted_unlicensed'");
    expect(storeSource).toContain("'tainted_unlicensed'");
  });

  it("enforces training eligibility in the query", () => {
    expect(storeSource).toContain("WHERE provenance_status = 'eligible'");
  });
});
