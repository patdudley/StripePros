export const PRICE_UNITS = ["per_stall", "each", "per_lf", "per_sqft", "per_char", "flat"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const UNIT_LABELS: Record<PriceUnit, string> = {
  per_stall: "per stall",
  each: "each",
  per_lf: "per LF",
  per_sqft: "per sqft",
  per_char: "per character",
  flat: "flat",
};

export type SeedPriceBookItem = {
  category: "Striping" | "Signage" | "Surface" | "Job";
  name: string;
  unit: PriceUnit;
  unitPrice: string;
  isActive: boolean;
  sortOrder: number;
};

const seed = (
  category: SeedPriceBookItem["category"],
  name: string,
  unit: PriceUnit,
  unitPrice: number,
  sortOrder: number,
  isActive = true,
): SeedPriceBookItem => ({ category, name, unit, unitPrice: unitPrice.toFixed(2), isActive, sortOrder });

export const DEFAULT_PRICE_BOOK: SeedPriceBookItem[] = [
  seed("Striping", "Standard stall — single line, restripe", "per_stall", 5, 10),
  seed("Striping", "Standard stall — double line, restripe", "per_stall", 7, 20),
  seed("Striping", "Standard stall — new layout", "per_stall", 9, 30),
  seed("Striping", "ADA stall + symbol", "each", 35, 40),
  seed("Striping", "ADA van stall + symbol + hatched aisle", "each", 55, 50),
  seed("Striping", "Access aisle hatching", "per_lf", 1.5, 60),
  seed("Striping", "Directional arrow", "each", 15, 70),
  seed("Striping", "Stop bar", "per_lf", 3, 80),
  seed("Striping", "Crosswalk bar", "per_lf", 3, 90),
  seed("Striping", "Letters / numbers", "per_char", 8, 100),
  seed("Striping", "Curb paint", "per_lf", 1.75, 110, false),
  seed("Striping", "Fire lane striping", "per_lf", 2, 120),
  seed("Striping", "Wheel stop — reset existing", "each", 15, 130),
  seed("Striping", "Wheel stop — supply and install", "each", 45, 140),
  seed("Signage", "ADA sign + post, install", "each", 175, 150),
  seed("Surface", "Sealcoat — single coat", "per_sqft", 0.16, 160),
  seed("Surface", "Sealcoat — two coat", "per_sqft", 0.24, 170),
  seed("Surface", "Crack fill", "per_lf", 1.1, 180),
  seed("Surface", "Asphalt patch", "per_sqft", 4.5, 190),
  seed("Job", "Mobilization / trip and setup", "flat", 250, 200, false),
  seed("Job", "Minimum job charge", "flat", 450, 210),
];
