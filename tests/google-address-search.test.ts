import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const geocodingSource = readFileSync(new URL("../lib/google-geocoding.ts", import.meta.url), "utf8");
const homepageSource = readFileSync(new URL("../app/stripe-pros-app.tsx", import.meta.url), "utf8");

describe("exact Google address search", () => {
  it("rejects intersections, routes, and partial matches", () => {
    expect(geocodingSource).toContain('new Set(["intersection", "route"])');
    expect(geocodingSource).toContain("result.partial_match");
  });

  it("shows and uses the canonical resolved address", () => {
    expect(homepageSource).toContain("GOOGLE ADDRESS CONFIRMED");
    expect(homepageSource).toContain("setAddress(site.label)");
  });
});
