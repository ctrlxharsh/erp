import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { AccessStore, MembershipRecord } from "./access";
import { createCaller } from "./root";
import {
  type Context,
  createCallerFactory,
  platformProcedure,
  requirePermission,
  router,
  schoolProcedure,
} from "./trpc";

const user = {
  id: "01a1e49b-0562-7249-94a2-cc1820800461",
  email: "u1@example.com",
  name: "User One",
};

function store(
  over: Partial<AccessStore> & { memberships?: MembershipRecord[] } = {},
): AccessStore {
  return {
    getPlatformRole: over.getPlatformRole ?? (async () => null),
    getMemberships: over.getMemberships ?? (async () => over.memberships ?? []),
  };
}

const member = (
  roles: MembershipRecord["roles"],
  over: Partial<MembershipRecord> = {},
): MembershipRecord => ({
  schoolId: "01a1e49b-0562-7249-94a2-cc182080046a",
  schoolName: "School A",
  schoolStatus: "active",
  roles,
  ...over,
});

function ctx(over: Partial<Context> = {}): Context {
  // The procedure-chain tests never touch the database or storage.
  return {
    db: null as never,
    storage: null as never,
    authAdmin: null as never,
    email: null as never,
    store: store(),
    user,
    activeSchoolId: null,
    ...over,
  };
}

// A tiny router that exercises each procedure builder.
const testRouter = router({
  approveMarks: schoolProcedure
    .use(requirePermission("marks.approve"))
    .query(({ ctx }) => ctx.schoolId),
  platformOnly: platformProcedure.query(({ ctx }) => ctx.platformRole),
});
const caller = createCallerFactory(testRouter);

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

describe("authedProcedure", () => {
  it("rejects signed-out callers", async () => {
    expect(await code(createCaller(ctx({ user: null })).session.me())).toBe("UNAUTHORIZED");
  });
});

describe("schoolProcedure", () => {
  it("rejects users without any school", async () => {
    expect(await code(caller(ctx()).approveMarks())).toBe("FORBIDDEN");
  });

  it("asks users with several schools to choose", async () => {
    const memberships = [
      member(["principal"]),
      member(["principal"], { schoolId: "01a1e49b-0562-7249-94a2-cc182080046b" }),
    ];
    expect(await code(caller(ctx({ store: store({ memberships }) })).approveMarks())).toBe(
      "PRECONDITION_FAILED",
    );
  });

  it("locks out suspended, expired and deleted schools", async () => {
    for (const schoolStatus of ["suspended", "expired", "deleted"] as const) {
      const memberships = [member(["principal"], { schoolStatus })];
      expect(await code(caller(ctx({ store: store({ memberships }) })).approveMarks())).toBe(
        "FORBIDDEN",
      );
    }
  });

  it("does not let a user act on a school they do not belong to", async () => {
    const memberships = [
      member(["principal"]),
      member(["principal"], { schoolId: "01a1e49b-0562-7249-94a2-cc182080046b" }),
    ];
    const c = ctx({
      store: store({ memberships }),
      activeSchoolId: "01a1e49b-0562-7249-94a2-cc182080046f",
    });
    expect(await code(caller(c).approveMarks())).toBe("PRECONDITION_FAILED");
  });
});

describe("requirePermission", () => {
  it("allows the Principal to approve marks, in the chosen school", async () => {
    const memberships = [
      member(["principal"]),
      member(["teacher"], { schoolId: "01a1e49b-0562-7249-94a2-cc182080046b" }),
    ];
    const c = ctx({
      store: store({ memberships }),
      activeSchoolId: "01a1e49b-0562-7249-94a2-cc182080046a",
    });
    expect(await caller(c).approveMarks()).toBe("01a1e49b-0562-7249-94a2-cc182080046a");
  });

  it("blocks teachers, admins, students and parents from approving marks", async () => {
    for (const role of ["teacher", "school_admin", "student", "parent", "staff"] as const) {
      const c = ctx({ store: store({ memberships: [member([role])] }) });
      expect(await code(caller(c).approveMarks())).toBe("FORBIDDEN");
    }
  });

  it("uses the role held in the chosen school, not in another one", async () => {
    // Principal in B, teacher in A. Choosing A must not grant approval.
    const memberships = [
      member(["teacher"]),
      member(["principal"], { schoolId: "01a1e49b-0562-7249-94a2-cc182080046b" }),
    ];
    const c = ctx({
      store: store({ memberships }),
      activeSchoolId: "01a1e49b-0562-7249-94a2-cc182080046a",
    });
    expect(await code(caller(c).approveMarks())).toBe("FORBIDDEN");
  });
});

describe("platformProcedure", () => {
  it("allows platform accounts and blocks everyone else", async () => {
    const platform = ctx({ store: store({ getPlatformRole: async () => "super_admin" }) });
    expect(await caller(platform).platformOnly()).toBe("super_admin");
    const schoolAdmin = ctx({ store: store({ memberships: [member(["school_admin"])] }) });
    expect(await code(caller(schoolAdmin).platformOnly())).toBe("FORBIDDEN");
  });
});

describe("school.current", () => {
  it("returns the school, roles and effective permissions", async () => {
    const c = ctx({ store: store({ memberships: [member(["teacher", "principal"])] }) });
    const result = await createCaller(c).school.current();
    expect(result.school).toEqual({ id: "01a1e49b-0562-7249-94a2-cc182080046a", name: "School A" });
    expect(result.permissions).toContain("marks.approve");
    expect(result.permissions).toContain("attendance.mark");
  });
});
