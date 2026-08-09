CREATE TYPE "public"."geometry_type" AS ENUM('polygon', 'polyline', 'point');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('paint', 'thermoplastic');--> statement-breakpoint
CREATE TYPE "public"."measurement_type" AS ENUM('area_sqft', 'length_ft', 'count');--> statement-breakpoint
CREATE TYPE "public"."price_unit" AS ENUM('per_stall', 'each', 'per_lf', 'per_sqft', 'per_char', 'flat');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "ada_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"total_stalls" integer NOT NULL,
	"existing_accessible" integer NOT NULL,
	"existing_van" integer NOT NULL,
	"required_accessible" integer NOT NULL,
	"required_van" integer NOT NULL,
	"accessible_deficit" integer NOT NULL,
	"van_deficit" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geometries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"label" text NOT NULL,
	"geom_type" geometry_type NOT NULL,
	"geojson" jsonb NOT NULL,
	"measurement_type" "measurement_type" NOT NULL,
	"computed_value" numeric(16, 2) NOT NULL,
	"linked_quote_item_id" uuid
);
--> statement-breakpoint
CREATE TABLE "price_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" "price_unit" NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"price_book_item_id" uuid,
	"description_snapshot" text NOT NULL,
	"unit_snapshot" "price_unit" NOT NULL,
	"unit_price_snapshot" numeric(12, 2) NOT NULL,
	"quantity" numeric(14, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_id" uuid,
	"site_id" uuid,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"material_type" "material_type" DEFAULT 'paint' NOT NULL,
	"material_multiplier" numeric(8, 2) DEFAULT '1.00' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"minimum_applied" boolean DEFAULT false NOT NULL,
	"total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_id" uuid,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"company_name" text NOT NULL,
	"logo_url" text,
	"terms" text DEFAULT 'Payment is due according to the terms shown on the accepted proposal.' NOT NULL,
	"paint_multiplier" numeric(8, 2) DEFAULT '1.00' NOT NULL,
	"thermoplastic_multiplier" numeric(8, 2) DEFAULT '2.80' NOT NULL,
	"quote_validity_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ada_assessments" ADD CONSTRAINT "ada_assessments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geometries" ADD CONSTRAINT "geometries_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geometries" ADD CONSTRAINT "geometries_linked_quote_item_id_quote_items_id_fk" FOREIGN KEY ("linked_quote_item_id") REFERENCES "public"."quote_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_book_items" ADD CONSTRAINT "price_book_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_price_book_item_id_price_book_items_id_fk" FOREIGN KEY ("price_book_item_id") REFERENCES "public"."price_book_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ada_assessments_quote_unique" ON "ada_assessments" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "customers_user_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "geometries_quote_idx" ON "geometries" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "price_book_user_sort_idx" ON "price_book_items" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "quote_items_quote_sort_idx" ON "quote_items" USING btree ("quote_id","sort_order");--> statement-breakpoint
CREATE INDEX "quotes_user_updated_idx" ON "quotes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "sites_user_idx" ON "sites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");