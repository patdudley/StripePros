import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/scan-lot/route";
import { isAiScanningEnabled } from "../lib/ai-scanning";

describe("automated imagery analysis compliance shutoff", () => {
  afterEach(() => {
    delete process.env.AI_SCANNING_ENABLED;
    delete process.env.OPENAI_API_KEY;
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
});
