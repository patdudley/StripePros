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

  it("keeps optional scope items inactive with non-negative prices", () => {
    expect(DEFAULT_PRICE_BOOK.find((item) => item.name === "Curb paint")?.isActive).toBe(false);
    expect(DEFAULT_PRICE_BOOK.find((item) => item.name === "Mobilization / trip and setup")?.isActive).toBe(false);
    expect(DEFAULT_PRICE_BOOK.every((item) => Number(item.unitPrice) >= 0)).toBe(true);
  });
});
