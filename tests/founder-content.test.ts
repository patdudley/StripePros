import { describe, expect, it } from "vitest";
import { generateFounderDrafts } from "../lib/founder/content";

describe("founder content generation", () => {
  it("always returns the three required differentiated categories", () => {
    const drafts = generateFounderDrafts({
      commits: [{ sha: "abc1234", message: "Build private Founder HQ", author: "pat", committedAt: new Date().toISOString(), url: "https://example.com" }],
      note: "A striper told me estimates get retyped three times.",
      metrics: { dials: 20, ownerConversations: 4, demosBooked: 2, demosHeld: 1, trials: 1, customers: 0, mrr: 0 },
      previousPosts: [],
    });
    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.category)).toEqual(["Build/Product", "GTM/Learning", "Founder/Industry Insight"]);
    expect(new Set(drafts.map((draft) => draft.body)).size).toBe(3);
  });
});
