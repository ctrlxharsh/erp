CREATE TYPE "public"."notice_audience" AS ENUM('all', 'teachers', 'students_parents');--> statement-breakpoint
CREATE TYPE "public"."notice_status" AS ENUM('draft', 'pending_approval', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "counters" (
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_school_id_key_pk" PRIMARY KEY("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"ref_no" integer,
	"ref_label" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" "notice_audience" DEFAULT 'all' NOT NULL,
	"status" "notice_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decision_comment" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_school_ref_unique" UNIQUE("school_id","ref_no")
);
--> statement-breakpoint
ALTER TABLE "school_profiles" ADD COLUMN "notice_approval_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notices_school_status_idx" ON "notices" USING btree ("school_id","status");
--> statement-breakpoint
-- Tenant isolation (ADR-026).
ALTER TABLE "counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "counters" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "notices" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
