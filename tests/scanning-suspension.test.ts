import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/scan-lot/route";
import { isAiScanningEnabled } from "../lib/ai-scanning";

describe("automated imagery analysis compliance shutoff", () => {
  afterEach(() => {
    delete process.env.AI_SCANNING_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.IMAGERY_PROVIDER;
    vi.restoreAllMocks();
  });

  it("defaults to disabled", () => {
    expect(isAiScanningEnabled()).toBe(false);
  });

  it("returns a structured suspension response before parsing or calling any provider", async () => {
    process.env.OPENAI_API_KEY = "must-not-be-used";
    const modelOrProviderFetch = vi.spyOn(globalThis, "fetch");

    const response = await POST(new Request("http://localhost/api/scan-lot", {
      method: "POST",
      body: "not-json-and-must-not-be-read",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "SCANNING_SUSPENDED",
      message: expect.stringContaining("Manual lot takeoff remains available"),
    });
    expect(modelOrProviderFetch).not.toHaveBeenCalled();
  });

  it("does not permit enabled scanning with the Google provider", async () => {
    process.env.AI_SCANNING_ENABLED = "true";
    process.env.IMAGERY_PROVIDER = "google";
    process.env.OPENAI_API_KEY = "must-not-be-used";
    const modelFetch = vi.spyOn(globalThis, "fetch");

    const response = await POST(new Request("http://localhost/api/scan-lot", { method: "POST", body: "{}" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "IMAGERY_ANALYSIS_NOT_LICENSED" });
    expect(modelFetch).not.toHaveBeenCalled();
  });

  it("keeps the local fixture path offline instead of accepting client-supplied pixels", async () => {
    process.env.AI_SCANNING_ENABLED = "true";
    process.env.IMAGERY_PROVIDER = "local-fixture";
    process.env.OPENAI_API_KEY = "must-not-be-used";
    const modelFetch = vi.spyOn(globalThis, "fetch");

    const response = await POST(new Request("http://localhost/api/scan-lot", { method: "POST", body: "{}" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "LOCAL_FIXTURE_OFFLINE_ONLY" });
    expect(modelFetch).not.toHaveBeenCalled();
  });
});
