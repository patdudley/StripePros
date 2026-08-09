import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepageSource = readFileSync(new URL("../app/stripe-pros-app.tsx", import.meta.url), "utf8");

describe("homepage lot counting", () => {
  it("never derives stall counts from selected lot area", () => {
    expect(homepageSource).not.toMatch(/lotArea\s*\//);
    expect(homepageSource).not.toContain("Math.round(lotArea / 495)");
    expect(homepageSource).not.toContain("setDraftCounts");
  });

  it("prices only explicitly placed visible marking types", () => {
    expect(homepageSource).toContain('marking.type === "stall"');
    expect(homepageSource).toContain('marking.type === "ada"');
    expect(homepageSource).toContain('marking.type === "arrow"');
    expect(homepageSource).toContain("Blocked areas stay uncounted");
  });
});
