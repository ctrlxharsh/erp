import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import type { AuthAdmin } from "./auth-admin";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Super Admin school management against the real Neon `test` database. Skipped without DATABASE_URL. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const superAdmin = "00000000-0000-7000-8000-0000000000c1";
const support = "00000000-0000-7000-8000-0000000000c2";
const schoolAdmin = "00000000-0000-7000-8000-0000000000c3";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("platform: schools and admin invites", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `platform-test-${Date.now()}`;
  const calls: string[] = [];
  const knownUsers = new Map<string, string>();
  let nextUser = 0;

  const authAdmin: AuthAdmin = {
    async findUserIdByEmail(email) {
      return knownUsers.get(email) ?? null;
    },
    async createUser({ email }) {
      const id = `00000000-0000-7000-8000-00000000d${String(++nextUser).padStart(3, "0")}`;
      knownUsers.set(email, id);
      calls.push(`create:${email}`);
      return { id };
    },
    async sendPasswordSetupEmail(email) {
      calls.push(`email:${email}`);
    },
  };

  const as = (userId: string): Context => ({
    db,
    storage: null as never,
    authAdmin,
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId: null,
  });

  beforeAll(async () => {
    await db.insert(schema.platformUsers).values([
      { userId: superAdmin, role: "super_admin" },
      { userId: support, role: "platform_support" },
    ]);
  });

  afterAll(async () => {
    const schools = await db
      .select({ id: schema.schools.id })
      .from(schema.schools)
      .where(like(schema.schools.name, `${tag}%`));
    const ids = schools.map((s) => s.id);
    if (ids.length) {
      await db.delete(schema.memberships).where(inArray(schema.memberships.schoolId, ids));
      // Audit events reference these schools and are append-only, so retire them instead.
      await db
        .update(schema.schools)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(inArray(schema.schools.id, ids));
    }
    await db
      .delete(schema.platformUsers)
      .where(inArray(schema.platformUsers.userId, [superAdmin, support]));
  });

  it("creates, lists, searches and sorts schools with server-side paging", async () => {
    const api = createCaller(as(superAdmin));
    for (const name of ["Alpha", "Bravo", "Charlie"])
      await api.platform.createSchool({ name: `${tag}-${name}` });
    const page1 = await api.platform.listSchools({
      page: 1,
      pageSize: 2,
      search: tag,
      sort: "name",
      direction: "asc",
    });
    expect(page1.total).toBe(3);
    expect(page1.items.map((s) => s.name)).toEqual([`${tag}-Alpha`, `${tag}-Bravo`]);
    const page2 = await api.platform.listSchools({
      page: 2,
      pageSize: 2,
      search: tag,
      sort: "name",
      direction: "asc",
    });
    expect(page2.items.map((s) => s.name)).toEqual([`${tag}-Charlie`]);
    const none = await api.platform.listSchools({
      page: 1,
      pageSize: 10,
      search: `${tag}%nope`,
      sort: "name",
      direction: "asc",
    });
    expect(none.total).toBe(0);
  });

  it("suspends and restores a school, only in valid states, and audits it", async () => {
    const api = createCaller(as(superAdmin));
    const school = await api.platform.createSchool({ name: `${tag}-Suspend` });
    expect(
      await code(api.platform.setSchoolStatus({ schoolId: school.id, status: "active" })),
    ).toBe("PRECONDITION_FAILED");
    const suspended = await api.platform.setSchoolStatus({
      schoolId: school.id,
      status: "suspended",
    });
    expect(suspended.status).toBe("suspended");
    expect(
      await code(api.platform.setSchoolStatus({ schoolId: school.id, status: "suspended" })),
    ).toBe("PRECONDITION_FAILED");
    expect(
      (await api.platform.setSchoolStatus({ schoolId: school.id, status: "active" })).status,
    ).toBe("active");
    const events = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(sql`${schema.auditEvents.entityId} = ${school.id}`);
    expect(events.map((e) => e.action).sort()).toEqual([
      "school.created",
      "school.restored",
      "school.suspended",
    ]);
  });

  it("a suspended school locks out its users", async () => {
    const api = createCaller(as(superAdmin));
    const school = await api.platform.createSchool({ name: `${tag}-Lock` });
    await db
      .insert(schema.memberships)
      .values({ userId: schoolAdmin, schoolId: school.id, roles: ["school_admin"] });
    const asAdmin = createCaller(as(schoolAdmin));
    expect((await asAdmin.school.current()).school.id).toBe(school.id);
    await api.platform.setSchoolStatus({ schoolId: school.id, status: "suspended" });
    expect(await code(asAdmin.school.current())).toBe("FORBIDDEN");
    await api.platform.setSchoolStatus({ schoolId: school.id, status: "active" });
    expect((await asAdmin.school.current()).school.id).toBe(school.id);
  });

  it("invites a new School Admin with a setup email, and an existing person without one", async () => {
    const api = createCaller(as(superAdmin));
    const school = await api.platform.createSchool({ name: `${tag}-Invite` });
    const first = await api.platform.inviteSchoolAdmin({
      schoolId: school.id,
      email: "Head@Example.com",
      name: "Head Teacher",
    });
    expect(first.emailSent).toBe(true);
    expect(calls).toEqual(["create:head@example.com", "email:head@example.com"]);
    const again = await api.platform.inviteSchoolAdmin({
      schoolId: school.id,
      email: "head@example.com",
      name: "Head Teacher",
    });
    expect(again).toEqual({ userId: first.userId, emailSent: false });
    const members = await db
      .select()
      .from(schema.memberships)
      .where(sql`${schema.memberships.schoolId} = ${school.id}`);
    expect(members).toHaveLength(1);
    expect(members[0]?.roles).toEqual(["school_admin"]);
    const [row] = (
      await api.platform.listSchools({
        page: 1,
        pageSize: 5,
        search: `${tag}-Invite`,
        sort: "name",
        direction: "asc",
      })
    ).items;
    expect(row?.adminCount).toBe(1);
  });

  it("Platform Support can look but not change; school staff cannot reach platform procedures", async () => {
    const supportApi = createCaller(as(support));
    expect(
      (
        await supportApi.platform.listSchools({
          page: 1,
          pageSize: 5,
          search: tag,
          sort: "name",
          direction: "asc",
        })
      ).total,
    ).toBeGreaterThan(0);
    expect(await code(supportApi.platform.createSchool({ name: `${tag}-Nope` }))).toBe("FORBIDDEN");
    const staffApi = createCaller(as(schoolAdmin));
    expect(
      await code(
        staffApi.platform.listSchools({
          page: 1,
          pageSize: 5,
          search: "",
          sort: "name",
          direction: "asc",
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await code(staffApi.platform.createSchool({ name: `${tag}-Nope` }))).toBe("FORBIDDEN");
  });
});
