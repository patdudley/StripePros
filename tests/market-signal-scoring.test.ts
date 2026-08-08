import { describe, expect, it } from "vitest";
import { isEligibleMarketSignal, rankMarketSignals, scoreMarketSignal } from "../lib/founder/market-signals/scoring";

const base = { platform: "Reddit", author: "owner", source: "Reddit public search RSS", query: "striping CRM", rawSnippet: "" };

describe("market signal scoring", () => {
  it("prioritizes current owner/operator pain with buying intent", () => {
    const strong = scoreMarketSignal({ ...base, title: "I own a striping company and hate our CRM", text: "Looking for estimating software because quoting parking lots manually is a mess. Any recommendations?", url: "https://example.com/strong", publishedAt: new Date().toISOString() });
    const weak = scoreMarketSignal({ ...base, title: "Generic software update", text: "A product shipped a feature.", url: "https://example.com/weak", publishedAt: null });
    expect(strong.score).toBeGreaterThanOrEqual(80);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("deduplicates and returns only the requested top results", () => {
    const signals = Array.from({ length: 8 }, (_, index) => ({ ...base, title: `Parking lot striping CRM pain ${index}`, text: "Our crew struggles with quoting and scheduling. Any recommendations?", url: `https://example.com/${index % 6}`, publishedAt: new Date().toISOString() }));
    expect(rankMarketSignals(signals, 5)).toHaveLength(5);
  });

  it("filters generic web noise before ranking", () => {
    const unrelated = { ...base, title: "Best walk-in bathtubs", text: "Compare installation pricing and features.", url: "https://example.com/unrelated", publishedAt: new Date().toISOString() };
    const relevant = { ...base, title: "Parking lot striping estimates", text: "I run a striping crew and our spreadsheet quoting is painfully slow.", url: "https://example.com/relevant", publishedAt: new Date().toISOString() };
    expect(isEligibleMarketSignal(unrelated)).toBe(false);
    expect(rankMarketSignals([unrelated, relevant])).toHaveLength(1);
  });
});
