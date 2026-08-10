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
    expect(routeSource).toContain("Never estimate from lot area");
  });

  it("does not guess markings hidden by blocked zones", () => {
    expect(routeSource).toContain("occludedRows");
    expect(routeSource).toContain("Do not silently omit an uncertain or boundary-truncated row");
    expect(routeSource).toContain("boundary-edge-");
    expect(routeSource).toContain("boundaryIncomplete");
  });

  it("localizes visible ADA access aisles without inferring one from an ADA stall", () => {
    expect(routeSource).toContain('item.type === "access_aisle"');
    expect(routeSource).toContain("A path can exist without an ADA stall");
    expect(routeSource).toContain("Do not classify an ADA stall solely because an access aisle");
    expect(routeSource).toContain("visible blue paint belongs to that stall");
  });

  it("counts solid stop lines independently from arrows, crosswalks, and speed bumps", () => {
    expect(routeSource).toContain('item.type === "stop_bar"');
    expect(routeSource).toContain('"stop_bar"');
    expect(routeSource).toContain("Count stop_bar once for every clearly visible solid transverse painted stop line");
    expect(routeSource).toContain("const stopBars = detections.filter");
  });

  it("detects speed bumps as localized scope instead of inferring them", () => {
    expect(routeSource).toContain('item.type === "speed_bump"');
    expect(routeSource).toContain("do not confuse stop bars, crosswalks, shadows, or pavement seams with speed bumps");
  });

  it("uses overlapping clean-image sections and rejects obstructed zero results", () => {
    expect(routeSource).toContain("sections.length < 2");
    expect(routeSource).toContain("single focused high-resolution aerial section");
    expect(routeSource).toContain("detections.length === 0 && occludedRows.length > 0");
  });

  it("runs focused sections in one concurrent low-latency wave", () => {
    expect(routeSource).toContain("mapWithConcurrency(sections, sections.length");
    expect(routeSource).not.toContain("controller.signal, scouts[index]");
    expect(routeSource).toContain("75_000");
    expect(routeSource).toContain('reasoning: { effort: "low" }');
    expect(routeSource).toContain("max_output_tokens: 5_000");
  });

  it("does not turn a production timeout into a successful zero count", () => {
    expect(routeSource).toContain("No zero count was recorded");
    expect(routeSource).toContain("lot-scan:timeout");
  });
});
