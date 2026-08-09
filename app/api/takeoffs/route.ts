import { getDb } from "@/db";
import { lotBoundaries, lotExclusions, quoteItems, quotes, sites, takeoffAnnotations, takeoffJobs } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { readSession } from "@/lib/session";
import { pavementAreaSqFt, polygonAreaSqFt } from "@/lib/takeoff/geometry";
import { takeoffSaveSchema } from "@/lib/takeoff/validation";

function storedGeometryType(type: "Point" | "LineString" | "Polygon") {
  return type === "Point" ? "point" as const : type === "LineString" ? "polyline" as const : "polygon" as const;
}

function storedPriceUnit(unit: "each" | "LF" | "per_char" | "flat") {
  return unit === "LF" ? "per_lf" as const : unit;
}

export async function POST(request: Request) {
  try {
    const userId = await readSession(request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const input = takeoffSaveSchema.parse(await request.json());
    const db = getDb();

    const [site] = await db.insert(sites).values({ userId, address: input.address, lat: input.lat, lng: input.lng }).returning({ id: sites.id });
    const [quote] = await db.insert(quotes).values({
      userId,
      siteId: site.id,
      materialType: input.material,
      materialMultiplier: input.materialMultiplier.toFixed(2),
      subtotal: input.subtotal.toFixed(2),
      minimumApplied: input.total > input.subtotal,
      total: input.total.toFixed(2),
      notes: "Annotation-driven manual takeoff",
    }).returning({ id: quotes.id });
    const [job] = await db.insert(takeoffJobs).values({ userId, siteId: site.id, quoteId: quote.id, countsVerified: input.countsVerified }).returning({ id: takeoffJobs.id });

    await db.insert(lotBoundaries).values({
      jobId: job.id,
      geojson: input.boundary,
      grossAreaSqFt: polygonAreaSqFt(input.boundary).toFixed(2),
      pavementAreaSqFt: pavementAreaSqFt(input.boundary, input.exclusions).toFixed(2),
    });
    if (input.exclusions.length) await db.insert(lotExclusions).values(input.exclusions.map((exclusion) => ({
      id: exclusion.id,
      jobId: job.id,
      type: exclusion.type,
      geojson: exclusion.geometry,
      areaSqFt: polygonAreaSqFt(exclusion.geometry).toFixed(2),
    })));
    if (input.annotations.length) await db.insert(takeoffAnnotations).values(input.annotations.map((annotation) => ({
      id: annotation.id,
      jobId: job.id,
      type: annotation.type,
      label: annotation.label,
      geomType: storedGeometryType(annotation.geometry.type),
      geojson: annotation.geometry,
      provenance: annotation.provenance,
      reviewStatus: annotation.reviewStatus,
      service: annotation.service,
      stencilText: annotation.text,
    })));
    if (input.quoteLines.length) await db.insert(quoteItems).values(input.quoteLines.map((line, index) => ({
      quoteId: quote.id,
      descriptionSnapshot: line.description,
      unitSnapshot: storedPriceUnit(line.unit),
      unitPriceSnapshot: line.unitPrice.toFixed(2),
      quantity: line.quantity.toFixed(2),
      lineTotal: (line.quantity * line.unitPrice * (line.id === "mobilization" ? 1 : input.materialMultiplier)).toFixed(2),
      sortOrder: index,
    })));

    return json({ jobId: job.id, quoteId: quote.id }, 201);
  } catch (error) {
    return apiError(error);
  }
}
