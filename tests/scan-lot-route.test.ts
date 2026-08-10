import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/scan-lot/route.ts", import.meta.url), "utf8");

describe("AI lot scan route", () => {
  it("analyzes the actual aerial capture with the vision model", () => {
    expect(routeSource).toContain('model: "gpt-5.6"');
    expect(routeSource).toContain('detail: "original"');
    expect(routeSource).toContain('type: "input_image"');
  });

  it("derives totals from localized detections rather than lot area", () => {
    expect(routeSource).toContain('detections.filter((item) => item.type === "stall").length');
    expect(routeSource).not.toMatch(/area|square feet|sq ft/i);
  });

  it("does not guess markings hidden by blocked zones", () => {
    expect(routeSource).toContain("omit it and describe the blocked zone");
  });

  it("allows enough time for a dense original-resolution count", () => {
    expect(routeSource).toContain("105_000");
    expect(routeSource).toContain('reasoning: { effort: "medium" }');
    expect(routeSource).toContain("max_output_tokens: 8_000");
  });
});
