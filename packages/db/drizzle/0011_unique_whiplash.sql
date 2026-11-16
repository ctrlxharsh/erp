CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TABLE "exam_subjects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"max_marks" integer NOT NULL,
	CONSTRAINT "exam_subjects_exam_class_subject_unique" UNIQUE("exam_id","class_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_school_session_name_unique" UNIQUE("school_id","academic_session_id","name")
);
--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"min_percent" integer NOT NULL,
	"grade_point" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grade_bands_school_grade_unique" UNIQUE("school_id","grade"),
	CONSTRAINT "grade_bands_school_min_unique" UNIQUE("school_id","min_percent")
);
--> statement-breakpoint
CREATE TABLE "leave_request_files" (
	"school_id" uuid NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "leave_request_files_leave_request_id_file_id_pk" PRIMARY KEY("leave_request_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "leave_types_school_name_unique" UNIQUE("school_id","name")
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks" numeric(6, 2),
	"absent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "marks_batch_student_unique" UNIQUE("batch_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "result_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "result_status" DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"decided_by" uuid,
	"decision_comment" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_batches_exam_section_subject_unique" UNIQUE("exam_id","section_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_files" ADD CONSTRAINT "leave_request_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_files" ADD CONSTRAINT "leave_request_files_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_files" ADD CONSTRAINT "leave_request_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_batch_id_result_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."result_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_subjects_school_idx" ON "exam_subjects" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "leave_request_files_school_idx" ON "leave_request_files" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "leave_requests_school_status_idx" ON "leave_requests" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "leave_requests_staff_idx" ON "leave_requests" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "marks_student_idx" ON "marks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "marks_school_idx" ON "marks" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "result_batches_school_status_idx" ON "result_batches" USING btree ("school_id","status");
--> statement-breakpoint
-- Tenant isolation (ADR-026).
ALTER TABLE "grade_bands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "grade_bands" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exams" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "exam_subjects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "exam_subjects" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "result_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "result_batches" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "marks" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "leave_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "leave_types" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "leave_requests" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE "leave_request_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "leave_request_files" FOR ALL TO erp_app
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
