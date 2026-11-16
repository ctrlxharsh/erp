import { filePurposeNames, platformRoles, schoolRoles } from "@erp/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Conventions (CONSTITUTION §6.8): UUID v7 primary keys (Postgres 18 `uuidv7()`), timestamptz,
 * soft delete with `deleted_at` for school records. `user_id` columns hold the Neon Auth user id
 * (`neon_auth."user".id`); there is no foreign key because that schema is managed by Neon.
 */
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const schoolStatus = pgEnum("school_status", [
  "active",
  "grace",
  "expired",
  "suspended",
  "deleted",
]);
export const platformRole = pgEnum("platform_role", platformRoles);
export const schoolRole = pgEnum("school_role", schoolRoles);
export const membershipStatus = pgEnum("membership_status", ["active", "disabled"]);

export const schools = pgTable("schools", {
  id: id(),
  name: text("name").notNull(),
  status: schoolStatus("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Super Admin and Platform Support accounts. */
export const platformUsers = pgTable("platform_users", {
  userId: uuid("user_id").primaryKey(),
  role: platformRole("role").notNull(),
  createdAt: createdAt(),
});

/** A user's roles in one school. One row per (user, school); roles combine as a union. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    roles: schoolRole("roles").array().notNull(),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("memberships_user_school_unique").on(table.userId, table.schoolId),
    index("memberships_school_id_idx").on(table.schoolId),
  ],
);

/**
 * Append-only audit log (CONSTITUTION §2.3). `school_id` is null for platform-level actions.
 * A trigger blocks UPDATE and DELETE, even for the table owner (see the RLS migration).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    schoolId: uuid("school_id").references(() => schools.id),
    actorUserId: uuid("actor_user_id"),
    /** Dotted verb such as `attendance.edit_after_window` or `auth.sign_in`. */
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** Context for the event. Never put passwords, tokens or children's personal data here. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_school_created_idx").on(table.schoolId, table.createdAt),
    index("audit_events_actor_idx").on(table.actorUserId),
  ],
);

export const filePurposeEnum = pgEnum("file_purpose", filePurposeNames as [string, ...string[]]);
export const fileStatus = pgEnum("file_status", ["pending", "ready"]);

/**
 * File metadata (CONSTITUTION §2.5). The bytes live in private object storage: `key` is the final
 * object key, set when the upload is finalized. Files are never stored in database columns.
 */
export const files = pgTable(
  "files",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    purpose: filePurposeEnum("purpose").notNull(),
    status: fileStatus("status").notNull().default("pending"),
    /** Stored MIME type: `image/webp` or `application/pdf`. Set on finalize. */
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    key: text("key"),
    ownerUserId: uuid("owner_user_id").notNull(),
    createdAt: createdAt(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [index("files_school_id_idx").on(table.schoolId)],
);

/** One profile row per school: the details shown on documents and in the app header. */
export const schoolProfiles = pgTable("school_profiles", {
  schoolId: uuid("school_id")
    .primaryKey()
    .references(() => schools.id),
  address: text("address"),
  affiliationNo: text("affiliation_no"),
  phone: text("phone"),
  /** The school's logo; the file itself is in private object storage. */
  logoFileId: uuid("logo_file_id").references(() => files.id),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  updatedAt: updatedAt(),
});

/** An academic year such as "2026-27". Exactly one per school may be active. */
export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    unique("academic_sessions_school_name_unique").on(table.schoolId, table.name),
    uniqueIndex("academic_sessions_one_active_idx")
      .on(table.schoolId)
      .where(sql`${table.isActive}`),
  ],
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [unique("classes_school_name_unique").on(table.schoolId, table.name)],
);

export const sections = pgTable(
  "sections",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("sections_class_name_unique").on(table.classId, table.name),
    index("sections_school_id_idx").on(table.schoolId),
  ],
);

export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique("subjects_school_name_unique").on(table.schoolId, table.name)],
);

/** Which subjects a class studies. */
export const classSubjects = pgTable(
  "class_subjects",
  {
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
  },
  (table) => [
    primaryKey({ columns: [table.classId, table.subjectId] }),
    index("class_subjects_school_id_idx").on(table.schoolId),
  ],
);

// ---------------------------------------------------------------------------------------------
// People (Phase 1)
// ---------------------------------------------------------------------------------------------

export const gender = pgEnum("gender", ["female", "male", "other"]);
export const personStatus = pgEnum("person_status", ["active", "left"]);
export const staffKind = pgEnum("staff_kind", ["teacher", "non_teaching"]);

/** A pupil. Their class for a given year lives in `student_enrolments`. */
export const students = pgTable(
  "students",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    admissionNo: text("admission_no").notNull(),
    fullName: text("full_name").notNull(),
    dateOfBirth: date("date_of_birth"),
    gender: gender("gender"),
    admissionDate: date("admission_date"),
    status: personStatus("status").notNull().default("active"),
    /** DPDP: the school records parental consent at admission (CONSTITUTION §11). */
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    consentRecordedBy: uuid("consent_recorded_by"),
    /** Set when the student has their own login. */
    userId: uuid("user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [unique("students_school_admission_unique").on(table.schoolId, table.admissionNo)],
);

/** Which section a student is in during one academic session. History is kept per session. */
export const studentEnrolments = pgTable(
  "student_enrolments",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    rollNo: integer("roll_no"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("enrolments_student_session_unique").on(table.studentId, table.academicSessionId),
    index("enrolments_section_idx").on(table.sectionId),
    index("enrolments_school_idx").on(table.schoolId),
  ],
);

/** A parent or guardian. One guardian can be linked to several children. */
export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    userId: uuid("user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The same email is the same person within a school.
    uniqueIndex("guardians_school_email_unique")
      .on(table.schoolId, sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
  ],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id),
    relation: text("relation"),
  },
  (table) => [
    primaryKey({ columns: [table.studentId, table.guardianId] }),
    index("student_guardians_guardian_idx").on(table.guardianId),
    index("student_guardians_school_idx").on(table.schoolId),
  ],
);

/** Teachers and non-teaching staff. Staff have no portal yet (CONSTITUTION §9.7). */
export const staff = pgTable(
  "staff",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    kind: staffKind("kind").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: personStatus("status").notNull().default("active"),
    userId: uuid("user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("staff_school_email_unique")
      .on(table.schoolId, sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
  ],
);

/**
 * Which teacher takes which section in a session. `subjectId` null means class teacher (daily
 * attendance); otherwise it is a subject-section pair (marks, homework).
 */
export const teacherAssignments = pgTable(
  "teacher_assignments",
  {
    id: id(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: uuid("subject_id").references(() => subjects.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("teacher_assignments_staff_idx").on(table.staffId),
    index("teacher_assignments_school_idx").on(table.schoolId),
    // One class teacher per section per session; one teacher per subject-section per session.
    uniqueIndex("teacher_assignments_class_teacher_unique")
      .on(table.academicSessionId, table.sectionId)
      .where(sql`${table.subjectId} is null`),
    uniqueIndex("teacher_assignments_subject_unique")
      .on(table.academicSessionId, table.sectionId, table.subjectId)
      .where(sql`${table.subjectId} is not null`),
  ],
);
