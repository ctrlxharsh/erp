CREATE TYPE "public"."membership_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'platform_support');--> statement-breakpoint
CREATE TYPE "public"."school_role" AS ENUM('school_admin', 'principal', 'teacher', 'student', 'parent', 'staff');--> statement-breakpoint
CREATE TYPE "public"."school_status" AS ENUM('active', 'grace', 'expired', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"roles" "school_role"[] NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_school_unique" UNIQUE("user_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "platform_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"status" "school_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_school_id_idx" ON "memberships" USING btree ("school_id");