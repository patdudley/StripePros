import { z } from "zod";
import { PRICE_UNITS } from "./price-book";

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});

export const signUpSchema = credentialsSchema.extend({
  companyName: z.string().trim().min(2).max(120),
});

export const priceBookItemSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  unit: z.enum(PRICE_UNITS),
  unitPrice: z.coerce.number().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000),
});

export const priceBookPatchSchema = priceBookItemSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);
