import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepageSource = readFileSync(new URL("../app/stripe-pros-app.tsx", import.meta.url), "utf8");

describe("homepage lot counting", () => {
  it("never derives stall counts from selected lot area", () => {
    expect(homepageSource).not.toMatch(/lotArea\s*\//);
    expect(homepageSource).not.toContain("Math.round(lotArea / 495)");
    expect(homepageSource).not.toContain("setDraftCounts");
  });

  it("uses the vision scan endpoint for every selected address", () => {
    expect(homepageSource).not.toContain("verifiedDemoCounts");
    expect(homepageSource).not.toContain('label.includes("3008")');
    expect(homepageSource).toContain('api<LotScanResult>("/api/scan-lot"');
    expect(homepageSource).toContain("setDetectedCounts({ stalls: result.stalls, ada: result.ada, arrows: result.arrows, accessAisles: result.accessAisles })");
  });

  it("keeps every detected category manually correctable", () => {
    expect(homepageSource).toContain('marking.type === "stall"');
    expect(homepageSource).toContain('marking.type === "ada"');
    expect(homepageSource).toContain('marking.type === "arrow"');
    expect(homepageSource).toContain('adjustDetectedCount("stalls", -1)');
    expect(homepageSource).toContain('adjustDetectedCount("ada", -1)');
    expect(homepageSource).toContain('adjustDetectedCount("arrows", -1)');
  });

  it("offers a real retry when the model times out", () => {
    expect(homepageSource).toContain("function retryDemoScan()");
    expect(homepageSource).toContain("RETRY AI SCAN");
  });
});
