/**
 * Permission identifiers and the role → permissions map (CONSTITUTION §3.2).
 * Code checks permissions, never role names. Adding a role later means adding one entry to
 * `rolePermissions`. Add new permissions here when a module ships and cover them in the tests.
 */

export const platformRoles = ["super_admin", "platform_support"] as const;
export const schoolRoles = [
  "school_admin",
  "principal",
  "teacher",
  "student",
  "parent",
  "staff",
] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type SchoolRole = (typeof schoolRoles)[number];
export type Role = PlatformRole | SchoolRole;

export const permissions = [
  // Platform
  "schools.view",
  "schools.manage",
  "platform_users.manage",
  "audit.view_platform",
  "school_view_as.start",
  // School setup and people
  "school.view",
  "school.setup",
  "people.view",
  "people.manage",
  "people.import",
  "staff.view",
  // Daily work
  "timetable.view",
  "timetable.manage",
  "attendance.view",
  "attendance.mark",
  "attendance.edit_after_window",
  "staff_attendance.view",
  "staff_attendance.manage",
  "homework.view",
  "homework.manage",
  "diary.view",
  "diary.manage",
  "material.view",
  "material.manage",
  "calendar.view",
  "calendar.manage",
  // Notices
  "notice.view",
  "notice.write",
  "notice.approve",
  "notice.publish",
  // Exams
  "exams.view",
  "marks.enter",
  "marks.approve",
  "results.view_own",
  // Leave and complaints
  "leave.apply",
  "leave.approve",
  "complaints.raise",
  "complaints.handle",
  // Fees
  "fees.view",
  "fees.view_own",
  "fees.record_payment",
  "fees.reverse_payment",
  // Reports and audit
  "reports.view",
  "audit.view_school",
] as const;

export type Permission = (typeof permissions)[number];

const viewOwn = [
  "school.view",
  "timetable.view",
  "attendance.view",
  "homework.view",
  "diary.view",
  "material.view",
  "calendar.view",
  "notice.view",
  "exams.view",
  "results.view_own",
  "fees.view_own",
] as const satisfies readonly Permission[];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: [
    "schools.view",
    "schools.manage",
    "platform_users.manage",
    "audit.view_platform",
    "school_view_as.start",
    "reports.view",
  ],
  // Read-only platform access: a limited Super Admin.
  platform_support: ["schools.view", "audit.view_platform", "school_view_as.start", "reports.view"],
  school_admin: [
    "school.view",
    "school.setup",
    "people.view",
    "people.manage",
    "people.import",
    "staff.view",
    "timetable.view",
    "timetable.manage",
    "attendance.view",
    "attendance.edit_after_window",
    "staff_attendance.view",
    "staff_attendance.manage",
    "homework.view",
    "diary.view",
    "material.view",
    "calendar.view",
    "calendar.manage",
    "notice.view",
    "notice.write",
    "exams.view",
    "leave.apply",
    "complaints.raise",
    "fees.view",
    "fees.record_payment",
    "fees.reverse_payment",
    "reports.view",
    "audit.view_school",
  ],
  principal: [
    "school.view",
    "people.view",
    "staff.view",
    "staff_attendance.view",
    "timetable.view",
    "attendance.view",
    "homework.view",
    "diary.view",
    "material.view",
    "calendar.view",
    "notice.view",
    "notice.write",
    "notice.approve",
    "notice.publish",
    "exams.view",
    "marks.approve",
    "leave.approve",
    "complaints.handle",
    "fees.view",
    "reports.view",
  ],
  teacher: [
    "school.view",
    "people.view",
    "timetable.view",
    "attendance.view",
    "attendance.mark",
    "homework.view",
    "homework.manage",
    "diary.view",
    "diary.manage",
    "material.view",
    "material.manage",
    "calendar.view",
    "notice.view",
    "exams.view",
    "marks.enter",
    "leave.apply",
    "complaints.raise",
  ],
  student: [...viewOwn],
  parent: [...viewOwn, "complaints.raise"],
  // Staff has no portal yet (§3.1): no permissions until one exists.
  staff: [],
};

export function isPlatformRole(role: Role): role is PlatformRole {
  return (platformRoles as readonly string[]).includes(role);
}

/** Union of the permissions of all given roles (a person can hold several roles). */
export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((role) => rolePermissions[role]));
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}
