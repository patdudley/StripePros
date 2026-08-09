CREATE TYPE "public"."annotation_provenance" AS ENUM('manual', 'model', 'fixture');--> statement-breakpoint
CREATE TYPE "public"."annotation_review_status" AS ENUM('unreviewed', 'accepted', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."exclusion_type" AS ENUM('building', 'landscaping', 'road', 'island', 'neighboring_property');--> statement-breakpoint
CREATE TYPE "public"."striping_service" AS ENUM('restripe', 'new_layout');--> statement-breakpoint
CREATE TYPE "public"."takeoff_annotation_type" AS ENUM('standard_stall', 'ada_stall', 'ada_access_aisle', 'directional_arrow', 'crosswalk', 'stop_bar', 'wheel_stop', 'painted_text', 'painted_curb');--> statement-breakpoint
CREATE TABLE "lot_boundaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"geojson" jsonb NOT NULL,
	"gross_area_sq_ft" numeric(16, 2) NOT NULL,
	"pavement_area_sq_ft" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "exclusion_type" NOT NULL,
	"geojson" jsonb NOT NULL,
	"area_sq_ft" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "takeoff_annotation_type" NOT NULL,
	"label" text NOT NULL,
	"geom_type" geometry_type NOT NULL,
	"geojson" jsonb NOT NULL,
	"provenance" "annotation_provenance" NOT NULL,
	"review_status" "annotation_review_status" NOT NULL,
	"service" "striping_service" NOT NULL,
	"stencil_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takeoff_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"counts_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lot_boundaries" ADD CONSTRAINT "lot_boundaries_job_id_takeoff_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."takeoff_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_exclusions" ADD CONSTRAINT "lot_exclusions_job_id_takeoff_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."takeoff_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_annotations" ADD CONSTRAINT "takeoff_annotations_job_id_takeoff_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."takeoff_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_jobs" ADD CONSTRAINT "takeoff_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_jobs" ADD CONSTRAINT "takeoff_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoff_jobs" ADD CONSTRAINT "takeoff_jobs_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lot_boundaries_job_unique" ON "lot_boundaries" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "lot_exclusions_job_idx" ON "lot_exclusions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "takeoff_annotations_job_review_idx" ON "takeoff_annotations" USING btree ("job_id","review_status");--> statement-breakpoint
CREATE INDEX "takeoff_jobs_user_updated_idx" ON "takeoff_jobs" USING btree ("user_id","updated_at");