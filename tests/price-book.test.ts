import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_BOOK } from "../lib/price-book";

describe("default price book", () => {
  it("ships the 21 required striping-native defaults", () => {
    expect(DEFAULT_PRICE_BOOK).toHaveLength(21);
    expect(DEFAULT_PRICE_BOOK[0]).toMatchObject({
      name: "Standard stall — single line, restripe",
      unit: "per_stall",
      unitPrice: "5.00",
    });
    expect(DEFAULT_PRICE_BOOK.at(-1)).toMatchObject({
      name: "Minimum job charge",
      unit: "flat",
      unitPrice: "450.00",
    });
  });

  it("uses unique, stable sort positions", () => {
    const positions = DEFAULT_PRICE_BOOK.map((item) => item.sortOrder);
    expect(new Set(positions).size).toBe(DEFAULT_PRICE_BOOK.length);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("seeds every item active with a non-negative price", () => {
    expect(DEFAULT_PRICE_BOOK.every((item) => item.isActive && Number(item.unitPrice) >= 0)).toBe(true);
  });
});
