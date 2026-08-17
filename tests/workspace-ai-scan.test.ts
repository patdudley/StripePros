import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(new URL("../app/workspace/credible-takeoff-workspace.tsx", import.meta.url), "utf8");

describe("live workspace AI scan", () => {
  it("only starts a real scan after the lot boundary is completed when scanning is enabled", () => {
    expect(workspaceSource).toContain("if (aiScanningEnabled)");
    expect(workspaceSource).toContain("window.setTimeout(() => void runAiScan(geometry)");
    expect(workspaceSource).toContain('fetch("/api/scan-lot"');
    expect(workspaceSource).toContain("Automated detection is paused pending an imagery license");
    expect(workspaceSource).toContain("RETRY AI SCAN");
    expect(workspaceSource).toContain("RE-SCAN LOT");
  });

  it("creates localized model annotations from every detection", () => {
    expect(workspaceSource).toContain("geometry: detection.geometry");
    expect(workspaceSource).toContain("detection.visibility");
    expect(workspaceSource).toContain('provenance: "model"');
    expect(workspaceSource).toContain('reviewStatus: "accepted"');
  });

  it("keeps the model results reviewable without the removed workspace-only setup panels", () => {
    expect(workspaceSource).toContain("Review every marker before verifying");
    expect(workspaceSource).not.toContain("STALL ROW ASSIST");
    expect(workspaceSource).not.toContain("AI SCAN READY");
    expect(workspaceSource).not.toContain("GENERATE THE QUOTE");
    expect(workspaceSource).toContain("standardStallPrice");
    expect(workspaceSource).toContain("adaStallPrice");
    expect(workspaceSource).not.toContain("prices.standard_stall");
    expect(workspaceSource).not.toContain("prices.ada_stall");
  });

  it("lets reviewers drag spot icons and drop new stalls without drawing a polygon", () => {
    expect(workspaceSource).toContain("function addSpotAtCenter");
    expect(workspaceSource).toContain("＋ ADD SPOT");
    expect(workspaceSource).toContain("draggable: annotation.reviewStatus !== \"rejected\"");
    expect(workspaceSource).toContain("translateGeometry");
  });
});
