import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(new URL("../app/workspace/credible-takeoff-workspace.tsx", import.meta.url), "utf8");

describe("live workspace AI scan", () => {
  it("starts a real scan after the lot boundary is completed", () => {
    expect(workspaceSource).toContain("window.setTimeout(() => void runAiScan(geometry)");
    expect(workspaceSource).toContain('fetch("/api/scan-lot"');
    expect(workspaceSource).not.toContain("AUTOMATIC DETECTION NOT CONFIGURED");
  });

  it("creates localized model annotations from every detection", () => {
    expect(workspaceSource).toContain("[detection.lng, detection.lat]");
    expect(workspaceSource).toContain('provenance: "model"');
    expect(workspaceSource).toContain('reviewStatus: "accepted"');
  });

  it("keeps the model results reviewable without the removed workspace-only setup panels", () => {
    expect(workspaceSource).toContain("Review every marker before verifying");
    expect(workspaceSource).not.toContain("STALL ROW ASSIST");
    expect(workspaceSource).not.toContain("AI SCAN READY");
    expect(workspaceSource).toContain("GENERATE THE QUOTE");
  });
});
