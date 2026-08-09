import { z } from "zod";

const position = z.tuple([z.number(), z.number()]);
const pointGeometry = z.object({ type: z.literal("Point"), coordinates: position });
const lineGeometry = z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2) });
const polygonGeometry = z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(position).min(4)).min(1) });
const geometry = z.discriminatedUnion("type", [pointGeometry, lineGeometry, polygonGeometry]);

export const takeoffSaveSchema = z.object({
  address: z.string().min(3).max(500),
  lat: z.number().finite(),
  lng: z.number().finite(),
  boundary: polygonGeometry,
  exclusions: z.array(z.object({
    id: z.string(),
    type: z.enum(["building", "landscaping", "road", "island", "neighboring_property"]),
    geometry: polygonGeometry,
  })).max(500),
  annotations: z.array(z.object({
    id: z.string(),
    type: z.enum(["standard_stall", "ada_stall", "ada_access_aisle", "directional_arrow", "crosswalk", "stop_bar", "wheel_stop", "painted_text", "painted_curb"]),
    label: z.string().min(1).max(200),
    geometry,
    provenance: z.enum(["manual", "model", "fixture"]),
    reviewStatus: z.enum(["unreviewed", "accepted", "edited", "rejected"]),
    service: z.enum(["restripe", "new_layout"]),
    text: z.string().max(200).optional(),
  })).max(5000),
  quoteLines: z.array(z.object({
    id: z.string(),
    description: z.string().min(1).max(300),
    unit: z.enum(["each", "LF", "per_char", "flat"]),
    quantity: z.number().nonnegative(),
    unitPrice: z.number().nonnegative(),
  })).max(100),
  material: z.enum(["paint", "thermoplastic"]),
  materialMultiplier: z.number().positive(),
  countsVerified: z.boolean(),
  subtotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export type TakeoffSaveInput = z.infer<typeof takeoffSaveSchema>;
