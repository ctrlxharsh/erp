import { describe, expect, it } from "vitest";
import { type MembershipRecord, resolveSchoolAccess } from "./access";

const school = (id: string, over: Partial<MembershipRecord> = {}): MembershipRecord => ({
  schoolId: id,
  schoolName: `School ${id}`,
  schoolStatus: "active",
  roles: ["teacher"],
  ...over,
});

describe("resolveSchoolAccess", () => {
  it("returns none when the user has no school", () => {
    expect(resolveSchoolAccess([], null)).toEqual({ kind: "none" });
  });

  it("picks the only school automatically", () => {
    const a = school("a");
    expect(resolveSchoolAccess([a], null)).toEqual({ kind: "ok", membership: a });
  });

  it("asks to choose when there are several schools and no choice", () => {
    expect(resolveSchoolAccess([school("a"), school("b")], null)).toEqual({ kind: "choose" });
  });

  it("uses the chosen school when it is one of theirs", () => {
    const b = school("b");
    expect(resolveSchoolAccess([school("a"), b], "b")).toEqual({ kind: "ok", membership: b });
  });

  it("never lets a user act on a school they do not belong to", () => {
    expect(resolveSchoolAccess([school("a"), school("b")], "other")).toEqual({ kind: "choose" });
    // With a single school, a foreign id falls back to their own, never to the foreign school.
    const a = school("a");
    expect(resolveSchoolAccess([a], "other")).toEqual({ kind: "ok", membership: a });
  });

  it("keeps working in the grace period", () => {
    const a = school("a", { schoolStatus: "grace" });
    expect(resolveSchoolAccess([a], null).kind).toBe("ok");
  });

  it.each(["expired", "suspended", "deleted"] as const)("locks out a %s school", (status) => {
    expect(resolveSchoolAccess([school("a", { schoolStatus: status })], null)).toEqual({
      kind: "locked",
      status,
    });
  });
});
