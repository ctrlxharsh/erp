import type { PlatformRole, SchoolRole } from "@erp/domain";

export type SchoolStatus = "active" | "grace" | "expired" | "suspended" | "deleted";

export interface MembershipRecord {
  schoolId: string;
  schoolName: string;
  schoolStatus: SchoolStatus;
  roles: SchoolRole[];
}

/** What the API needs to know about a user's access. Implemented on Drizzle; faked in tests. */
export interface AccessStore {
  getPlatformRole(userId: string): Promise<PlatformRole | null>;
  /** Active memberships only (disabled ones are filtered out). */
  getMemberships(userId: string): Promise<MembershipRecord[]>;
}

/** Schools in these states keep working; the others lock every user out (ADR-015). */
const openStatuses: readonly SchoolStatus[] = ["active", "grace"];
export const isSchoolOpen = (status: SchoolStatus) => openStatuses.includes(status);

export type SchoolAccess =
  | { kind: "ok"; membership: MembershipRecord }
  /** The user belongs to no school. */
  | { kind: "none" }
  /** The user belongs to several schools and has not picked one (or the pick is not theirs). */
  | { kind: "choose" }
  /** The chosen school is suspended, expired or deleted. */
  | { kind: "locked"; status: SchoolStatus };

/**
 * Picks the school a request acts on. A requested school that the user does not belong to is
 * treated like no choice at all, so one school's id never confirms another school exists.
 */
export function resolveSchoolAccess(
  memberships: readonly MembershipRecord[],
  activeSchoolId: string | null,
): SchoolAccess {
  if (memberships.length === 0) return { kind: "none" };
  const chosen =
    memberships.find((m) => m.schoolId === activeSchoolId) ??
    (memberships.length === 1 ? memberships[0] : undefined);
  if (!chosen) return { kind: "choose" };
  if (!isSchoolOpen(chosen.schoolStatus)) return { kind: "locked", status: chosen.schoolStatus };
  return { kind: "ok", membership: chosen };
}
