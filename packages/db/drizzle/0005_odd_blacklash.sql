CREATE TYPE "public"."gender" AS ENUM('female', 'male', 'other');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."staff_kind" AS ENUM('teacher', 'non_teaching');--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "staff_kind" NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "student_enrolments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"roll_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolments_student_session_unique" UNIQUE("student_id","academic_session_id")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relation" text,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_no" text NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"admission_date" date,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"consent_recorded_at" timestamp with time zone,
	"consent_recorded_by" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "students_school_admission_unique" UNIQUE("school_id","admission_no")
);
--> statement-breakpoint
CREATE TABLE "teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_school_email_unique" ON "guardians" USING btree ("school_id",lower("email")) WHERE "guardians"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_school_email_unique" ON "staff" USING btree ("school_id",lower("email")) WHERE "staff"."email" is not null;--> statement-breakpoint
CREATE INDEX "enrolments_section_idx" ON "student_enrolments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "enrolments_school_idx" ON "student_enrolments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "student_guardians_school_idx" ON "student_guardians" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "teacher_assignments_staff_idx" ON "teacher_assignments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "teacher_assignments_school_idx" ON "teacher_assignments" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_assignments_class_teacher_unique" ON "teacher_assignments" USING btree ("academic_session_id","section_id") WHERE "teacher_assignments"."subject_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_assignments_subject_unique" ON "teacher_assignments" USING btree ("academic_session_id","section_id","subject_id") WHERE "teacher_assignments"."subject_id" is not null;
--> statement-breakpoint
-- Tenant isolation (ADR-026).
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "students" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "student_enrolments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_enrolments" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "guardians" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "student_guardians" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "student_guardians" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "staff" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "teacher_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "teacher_assignments" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
