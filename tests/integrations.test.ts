import { afterEach, describe, expect, it } from "vitest";
import { oauthProviderConfigured, providerDefinition } from "@/lib/integrations/providers";

const original = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

describe("integration provider setup", () => {
  it("uses official authorization endpoints", () => {
    expect(providerDefinition("hubspot").authorizationUrl).toBe("https://app.hubspot.com/oauth/authorize");
    expect(providerDefinition("jobber").authorizationUrl).toBe("https://api.getjobber.com/api/oauth/authorize");
    expect(providerDefinition("quickbooks").authorizationUrl).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(providerDefinition("stripe").authorizationUrl).toBe("https://connect.stripe.com/oauth/authorize");
  });

  it("does not call credentials-ready until encryption and provider secrets exist", () => {
    process.env.INTEGRATION_TOKEN_KEY = "short";
    process.env.JOBBER_CLIENT_ID = "client";
    process.env.JOBBER_CLIENT_SECRET = "secret";
    expect(oauthProviderConfigured("jobber")).toBe(false);
    process.env.INTEGRATION_TOKEN_KEY = "a-secure-integration-token-key-longer-than-32";
    expect(oauthProviderConfigured("jobber")).toBe(true);
  });

  it("enables PKCE for Jobber authorization", () => {
    expect(providerDefinition("jobber").pkce).toBe(true);
  });
});

