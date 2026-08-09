import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepageSource = readFileSync(new URL("../app/stripe-pros-app.tsx", import.meta.url), "utf8");

describe("homepage lot counting", () => {
  it("never derives stall counts from selected lot area", () => {
    expect(homepageSource).not.toMatch(/lotArea\s*\//);
    expect(homepageSource).not.toContain("Math.round(lotArea / 495)");
    expect(homepageSource).not.toContain("setDraftCounts");
  });

  it("uses a verified address-specific scan instead of an area estimate", () => {
    expect(homepageSource).toContain('label.includes("3008")');
    expect(homepageSource).toContain("{ stalls: 30, ada: 2, arrows: 7 }");
    expect(homepageSource).toContain("setDetectedCounts(verified)");
  });

  it("keeps every detected category manually correctable", () => {
    expect(homepageSource).toContain('marking.type === "stall"');
    expect(homepageSource).toContain('marking.type === "ada"');
    expect(homepageSource).toContain('marking.type === "arrow"');
    expect(homepageSource).toContain('adjustDetectedCount("stalls", -1)');
    expect(homepageSource).toContain('adjustDetectedCount("ada", -1)');
    expect(homepageSource).toContain('adjustDetectedCount("arrows", -1)');
  });
});
