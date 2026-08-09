import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const quoteStatus = pgEnum("quote_status", ["draft", "sent", "won", "lost"]);
export const materialType = pgEnum("material_type", ["paint", "thermoplastic"]);
export const priceUnit = pgEnum("price_unit", [
  "per_stall",
  "each",
  "per_lf",
  "per_sqft",
  "per_char",
  "flat",
]);
export const geometryType = pgEnum("geometry_type", ["polygon", "polyline", "point"]);
export const measurementType = pgEnum("measurement_type", ["area_sqft", "length_ft", "count"]);
export const annotationProvenance = pgEnum("annotation_provenance", ["manual", "model", "fixture"]);
export const annotationReviewStatus = pgEnum("annotation_review_status", ["unreviewed", "accepted", "edited", "rejected"]);
export const takeoffAnnotationType = pgEnum("takeoff_annotation_type", ["standard_stall", "ada_stall", "ada_access_aisle", "directional_arrow", "crosswalk", "stop_bar", "wheel_stop", "painted_text", "painted_curb"]);
export const exclusionType = pgEnum("exclusion_type", ["building", "landscaping", "road", "island", "neighboring_property"]);
export const stripingService = pgEnum("striping_service", ["restripe", "new_layout"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  companyName: text("company_name").notNull(),
  logoUrl: text("logo_url"),
  terms: text("terms").notNull().default("Payment is due according to the terms shown on the accepted proposal."),
  paintMultiplier: numeric("paint_multiplier", { precision: 8, scale: 2 }).notNull().default("1.00"),
  thermoplasticMultiplier: numeric("thermoplastic_multiplier", { precision: 8, scale: 2 }).notNull().default("2.80"),
  quoteValidityDays: integer("quote_validity_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customers_user_idx").on(table.userId)]);

export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  notes: text("notes"),
}, (table) => [index("sites_user_idx").on(table.userId)]);

export const priceBookItems = pgTable("price_book_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: priceUnit("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [index("price_book_user_sort_idx").on(table.userId, table.sortOrder)]);

export const quotes = pgTable("quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  status: quoteStatus("status").notNull().default("draft"),
  materialType: materialType("material_type").notNull().default("paint"),
  materialMultiplier: numeric("material_multiplier", { precision: 8, scale: 2 }).notNull().default("1.00"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0.00"),
  minimumApplied: boolean("minimum_applied").notNull().default(false),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("quotes_user_updated_idx").on(table.userId, table.updatedAt)]);

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  priceBookItemId: uuid("price_book_item_id").references(() => priceBookItems.id, { onDelete: "set null" }),
  descriptionSnapshot: text("description_snapshot").notNull(),
  unitSnapshot: priceUnit("unit_snapshot").notNull(),
  unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [index("quote_items_quote_sort_idx").on(table.quoteId, table.sortOrder)]);

export const geometries = pgTable("geometries", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  geomType: geometryType("geom_type").notNull(),
  geojson: jsonb("geojson").notNull(),
  measurementType: measurementType("measurement_type").notNull(),
  computedValue: numeric("computed_value", { precision: 16, scale: 2 }).notNull(),
  linkedQuoteItemId: uuid("linked_quote_item_id").references(() => quoteItems.id, { onDelete: "set null" }),
}, (table) => [index("geometries_quote_idx").on(table.quoteId)]);

export const adaAssessments = pgTable("ada_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  totalStalls: integer("total_stalls").notNull(),
  existingAccessible: integer("existing_accessible").notNull(),
  existingVan: integer("existing_van").notNull(),
  requiredAccessible: integer("required_accessible").notNull(),
  requiredVan: integer("required_van").notNull(),
  accessibleDeficit: integer("accessible_deficit").notNull(),
  vanDeficit: integer("van_deficit").notNull(),
}, (table) => [uniqueIndex("ada_assessments_quote_unique").on(table.quoteId)]);

export const takeoffJobs = pgTable("takeoff_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  countsVerified: boolean("counts_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("takeoff_jobs_user_updated_idx").on(table.userId, table.updatedAt)]);

export const lotBoundaries = pgTable("lot_boundaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => takeoffJobs.id, { onDelete: "cascade" }),
  geojson: jsonb("geojson").notNull(),
  grossAreaSqFt: numeric("gross_area_sq_ft", { precision: 16, scale: 2 }).notNull(),
  pavementAreaSqFt: numeric("pavement_area_sq_ft", { precision: 16, scale: 2 }).notNull(),
}, (table) => [uniqueIndex("lot_boundaries_job_unique").on(table.jobId)]);

export const lotExclusions = pgTable("lot_exclusions", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => takeoffJobs.id, { onDelete: "cascade" }),
  type: exclusionType("type").notNull(),
  geojson: jsonb("geojson").notNull(),
  areaSqFt: numeric("area_sq_ft", { precision: 16, scale: 2 }).notNull(),
}, (table) => [index("lot_exclusions_job_idx").on(table.jobId)]);

export const takeoffAnnotations = pgTable("takeoff_annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => takeoffJobs.id, { onDelete: "cascade" }),
  type: takeoffAnnotationType("type").notNull(),
  label: text("label").notNull(),
  geomType: geometryType("geom_type").notNull(),
  geojson: jsonb("geojson").notNull(),
  provenance: annotationProvenance("provenance").notNull(),
  reviewStatus: annotationReviewStatus("review_status").notNull(),
  service: stripingService("service").notNull(),
  stencilText: text("stencil_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("takeoff_annotations_job_review_idx").on(table.jobId, table.reviewStatus)]);
