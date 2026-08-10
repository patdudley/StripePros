import { afterEach, describe, expect, it, vi } from "vitest";
import { runLicensedScanPipeline } from "../app/api/scan-lot/route";
import { localFixtureProviderDescriptor } from "../lib/imagery/providers";

const modelResult = (sectionId: string) => ({
  output_text: JSON.stringify({
    imageUsable: true,
    failureReason: "",
    confidence: 0.9,
    summary: "section counted",
    warnings: [],
    detections: [{ sectionId, rowId: `${sectionId}-row`, type: "stall", x: 0.5, y: 0.5, confidence: 0.9 }],
    occludedRows: [],
  }),
});

describe("production lot-scan scheduling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SCANNING_ENABLED;
    delete process.env.IMAGERY_PROVIDER;
  });

  it("processes four focused sections in one parallel wave followed by one reconciliation call", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_SCANNING_ENABLED = "true";
    process.env.IMAGERY_PROVIDER = "local-fixture";
    let active = 0;
    let peakActive = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      const body = JSON.parse(String(init?.body)) as { input: Array<{ content: Array<{ text?: string }> }> };
      const text = body.input[0].content.map((item) => item.text ?? "").join(" ");
      const sectionId = text.match(/section-\d+/)?.[0] ?? "section-1";
      return new Response(JSON.stringify(modelResult(sectionId)), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const sections = Array.from({ length: 4 }, (_, index) => ({
      image: "data:image/jpeg;base64,AA==",
      boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      viewport: { north: 33 + index * 0.001, south: 32.999 + index * 0.001, east: -117, west: -117.001 },
    }));
    const startedAt = performance.now();
    const response = await runLicensedScanPipeline({
      provider: localFixtureProviderDescriptor,
      apiKey: "test-key",
      address: "2605 Camino del Rio S Ste 100, San Diego, CA 92108",
      sections: sections.map((section, index) => ({ ...section, id: `section-${index + 1}` })),
    });
    const elapsed = performance.now() - startedAt;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(peakActive).toBe(4);
    expect(elapsed).toBeLessThan(1_000);
  });
});
