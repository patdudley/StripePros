import { describe, expect, it } from "vitest";
import { calculateQuote } from "../lib/quote-math";

describe("quote calculation", () => {
  it("uses minimum charge as a floor rather than adding it", () => {
    expect(calculateQuote([{ category: "Striping", quantity: 10, unitPrice: 5 }], 1, 450)).toEqual({
      rawSubtotal: 50,
      minimumApplied: true,
      total: 450,
    });
  });

  it("applies the material multiplier only to Striping items", () => {
    const result = calculateQuote([
      { category: "Striping", quantity: 10, unitPrice: 5 },
      { category: "Surface", quantity: 100, unitPrice: 1 },
      { category: "Job", quantity: 1, unitPrice: 250 },
    ], 2.8, 0);
    expect(result.rawSubtotal).toBe(490);
  });
});
