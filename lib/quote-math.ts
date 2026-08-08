export type QuoteCalculationItem = {
  category: string;
  quantity: number;
  unitPrice: number;
};

export type QuoteCalculation = {
  rawSubtotal: number;
  minimumApplied: boolean;
  total: number;
};

export function calculateQuote(
  items: QuoteCalculationItem[],
  materialMultiplier: number,
  minimumCharge: number,
): QuoteCalculation {
  const rawSubtotal = items.reduce((sum, item) => {
    const multiplier = item.category === "Striping" ? materialMultiplier : 1;
    return sum + item.quantity * item.unitPrice * multiplier;
  }, 0);
  const minimumApplied = rawSubtotal > 0 && rawSubtotal < minimumCharge;
  return {
    rawSubtotal,
    minimumApplied,
    total: minimumApplied ? minimumCharge : rawSubtotal,
  };
}
