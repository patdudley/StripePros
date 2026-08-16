import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/scan-config/route";
import { POST } from "../app/api/scan-lot/route";
import { getAiScanningStatus, isAiScanningEnabled } from "../lib/ai-scanning";

describe("automated imagery analysis compliance shutoff", () => {
  afterEach(() => {
    delete process.env.AI_SCANNING_ENABLED;
    delete process.env.AI_SCANNING_SUSPENDED;
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it("defaults to enabled when OpenAI is configured", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(isAiScanningEnabled()).toBe(true);
  });

  it("ignores a stale AI_SCANNING_ENABLED=false when OpenAI is configured", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_SCANNING_ENABLED = "false";
    expect(isAiScanningEnabled()).toBe(true);
    expect(getAiScanningStatus()).toMatchObject({ enabled: true, reason: "ready", hasOpenAiKey: true });
  });

  it("defaults to disabled without OpenAI configured", () => {
    expect(isAiScanningEnabled()).toBe(false);
    expect(getAiScanningStatus()).toMatchObject({ enabled: false, reason: "missing_openai_key" });
  });

  it("returns a structured suspension response before parsing or calling any provider", async () => {
    process.env.AI_SCANNING_SUSPENDED = "true";
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

  it("exposes scan readiness without leaking secrets", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_SCANNING_ENABLED = "false";
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      reason: "ready",
      hasOpenAiKey: true,
      aiScanningFlag: "false",
      scanningSuspended: false,
    });
  });
});
