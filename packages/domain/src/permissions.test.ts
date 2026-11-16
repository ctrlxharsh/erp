import { describe, expect, it } from "vitest";
import {
  can,
  isPlatformRole,
  type Permission,
  permissions,
  permissionsFor,
  platformRoles,
  type Role,
  rolePermissions,
  schoolRoles,
} from "./permissions";

const allRoles: Role[] = [...platformRoles, ...schoolRoles];

function rolesWith(permission: Permission): Role[] {
  return allRoles.filter((role) => rolePermissions[role].includes(permission));
}

describe("permission map", () => {
  it("has an entry for every role", () => {
    for (const role of allRoles) expect(rolePermissions[role]).toBeDefined();
  });

  it("only uses known permissions and has no duplicates", () => {
    for (const role of allRoles) {
      const list = rolePermissions[role];
      expect(new Set(list).size).toBe(list.length);
      for (const permission of list) expect(permissions).toContain(permission);
    }
  });

  it("every permission is granted to at least one role", () => {
    for (const permission of permissions) expect(rolesWith(permission).length).toBeGreaterThan(0);
  });
});

describe("approval powers", () => {
  it("only the Principal can approve marks and leave", () => {
    expect(rolesWith("marks.approve")).toEqual(["principal"]);
    expect(rolesWith("leave.approve")).toEqual(["principal"]);
  });

  it("only the Principal can approve notices; School Admin cannot publish directly", () => {
    expect(rolesWith("notice.approve")).toEqual(["principal"]);
    expect(can(["school_admin"], "notice.publish")).toBe(false);
    expect(can(["school_admin"], "notice.write")).toBe(true);
  });

  it("only teachers enter marks and mark attendance", () => {
    expect(rolesWith("marks.enter")).toEqual(["teacher"]);
    expect(rolesWith("attendance.mark")).toEqual(["teacher"]);
  });

  it("only School Admin edits attendance after the window and records fees", () => {
    expect(rolesWith("attendance.edit_after_window")).toEqual(["school_admin"]);
    expect(rolesWith("fees.record_payment")).toEqual(["school_admin"]);
    expect(rolesWith("fees.reverse_payment")).toEqual(["school_admin"]);
  });
});

describe("platform roles", () => {
  it("Platform Support is read-only: nothing that manages or changes data", () => {
    const support = rolePermissions.platform_support;
    expect(support.some((p) => p.endsWith(".manage"))).toBe(false);
    expect(support).not.toContain("school.setup");
  });

  it("platform roles hold no school-data permissions", () => {
    for (const role of platformRoles) {
      expect(can([role], "people.view")).toBe(false);
      expect(can([role], "attendance.mark")).toBe(false);
    }
  });

  it("identifies platform roles", () => {
    expect(isPlatformRole("super_admin")).toBe(true);
    expect(isPlatformRole("teacher")).toBe(false);
  });
});

describe("students, parents and staff", () => {
  it("cannot manage anything", () => {
    for (const role of ["student", "parent", "staff"] as const) {
      expect(rolePermissions[role].some((p) => p.endsWith(".manage"))).toBe(false);
    }
  });

  it("students and parents see only their own fees and results", () => {
    for (const role of ["student", "parent"] as const) {
      expect(can([role], "fees.view_own")).toBe(true);
      expect(can([role], "fees.view")).toBe(false);
      expect(can([role], "results.view_own")).toBe(true);
    }
  });

  it("staff has no permissions until a portal exists", () => {
    expect(rolePermissions.staff).toEqual([]);
  });
});

describe("multiple roles", () => {
  it("combine as a union", () => {
    const both = permissionsFor(["school_admin", "principal"]);
    expect(both.has("marks.approve")).toBe(true);
    expect(both.has("school.setup")).toBe(true);
  });

  it("an empty role list grants nothing", () => {
    expect(permissionsFor([]).size).toBe(0);
  });
});
