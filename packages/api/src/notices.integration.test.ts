import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Notices and their approval workflow on the real Neon `test` database. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000601";
const principal = "00000000-0000-7000-8000-000000000602";
const teacher = "00000000-0000-7000-8000-000000000603";
const parent = "00000000-0000-7000-8000-000000000604";
const adminB = "00000000-0000-7000-8000-000000000605";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("notices", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `notices-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  const as = (userId: string, schoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: { send: async () => undefined },
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId: schoolId,
  });

  beforeAll(async () => {
    const [a, b] = await db
      .insert(schema.schools)
      .values([{ name: `${tag}-A` }, { name: `${tag}-B` }])
      .returning({ id: schema.schools.id });
    schoolA = a?.id ?? "";
    schoolB = b?.id ?? "";
    await db.insert(schema.memberships).values([
      { userId: admin, schoolId: schoolA, roles: ["school_admin"] },
      { userId: principal, schoolId: schoolA, roles: ["principal"] },
      { userId: teacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parent, schoolId: schoolA, roles: ["parent"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
    await createCaller(as(admin, schoolA)).setup.createSession({
      name: "2026-27",
      startDate: "2000-04-01",
      endDate: "2099-03-31",
    });
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.notifications,
      schema.notices,
      schema.counters,
      schema.academicSessions,
      schema.schoolProfiles,
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  const draft = (api: ReturnType<typeof createCaller>, over: Record<string, unknown> = {}) =>
    api.notices.save({
      title: "Annual day",
      body: "The annual day will be held on Friday.",
      audience: "all",
      ...over,
    } as never);

  it("a School Admin's notice goes to the Principal, and approval publishes it to the audience", async () => {
    const adminApi = createCaller(as(admin, schoolA));
    const { id } = await draft(adminApi);
    // Drafts are private to the author.
    expect(await code(createCaller(as(parent, schoolA)).notices.get({ id }))).toBe("NOT_FOUND");
    expect(await adminApi.notices.submit({ id })).toEqual({ status: "pending_approval" });
    expect(await code(adminApi.notices.submit({ id }))).toBe("PRECONDITION_FAILED");
    expect(
      await code(
        adminApi.notices.save({ id, title: "Changed", body: "Changed body", audience: "all" }),
      ),
    ).toBe("PRECONDITION_FAILED");

    const principalApi = createCaller(as(principal, schoolA));
    expect((await principalApi.notices.list({ tab: "approvals" })).map((n) => n.title)).toEqual([
      "Annual day",
    ]);
    expect((await principalApi.notifications.list()).items.map((n) => n.kind)).toContain(
      "notice.pending",
    );
    // Admin and others cannot approve.
    expect(await code(adminApi.notices.approve({ id }))).toBe("FORBIDDEN");
    expect(await code(createCaller(as(teacher, schoolA)).notices.approve({ id }))).toBe(
      "FORBIDDEN",
    );

    await principalApi.notices.approve({ id });
    const published = await adminApi.notices.get({ id });
    expect(published).toMatchObject({
      status: "published",
      refLabel: "NOT/2026-27/0001",
      canEdit: false,
      canDelete: false,
    });
    expect(
      (await createCaller(as(parent, schoolA)).notices.list({ tab: "published" })).map(
        (n) => n.title,
      ),
    ).toEqual(["Annual day"]);
    expect(
      (await createCaller(as(parent, schoolA)).notifications.list()).items.map((n) => n.title),
    ).toEqual(["Annual day"]);
    expect((await adminApi.notifications.list()).items.map((n) => n.kind)).toContain(
      "notice.approved",
    );
    expect(await code(principalApi.notices.approve({ id }))).toBe("PRECONDITION_FAILED");
  });

  it("the Principal can send a notice back with a reason; the author fixes and resubmits", async () => {
    const adminApi = createCaller(as(admin, schoolA));
    const principalApi = createCaller(as(principal, schoolA));
    const { id } = await draft(adminApi, { title: "Fee reminder", body: "Please pay the fees." });
    await adminApi.notices.submit({ id });
    expect(await code(principalApi.notices.reject({ id, comment: "" }))).toBe("BAD_REQUEST");
    await principalApi.notices.reject({ id, comment: "Add the due date" });
    const rejected = await adminApi.notices.get({ id });
    expect(rejected).toMatchObject({
      status: "rejected",
      decisionComment: "Add the due date",
      canEdit: true,
    });
    expect((await adminApi.notifications.list()).items.map((n) => n.title)).toContain(
      "Your notice was sent back",
    );
    await adminApi.notices.save({
      id,
      title: "Fee reminder",
      body: "Please pay the fees by 30 November.",
      audience: "all",
    });
    expect(await adminApi.notices.submit({ id })).toEqual({ status: "pending_approval" });
    await principalApi.notices.approve({ id });
    expect((await adminApi.notices.get({ id })).refLabel).toBe("NOT/2026-27/0002");
  });

  it("the Principal's own notice is published at once, to the audience it names", async () => {
    const principalApi = createCaller(as(principal, schoolA));
    const { id } = await draft(principalApi, {
      title: "Staff meeting",
      body: "Staff meeting at 3 pm.",
      audience: "teachers",
    });
    expect(await principalApi.notices.submit({ id })).toEqual({ status: "published" });
    expect(
      (await createCaller(as(teacher, schoolA)).notices.list({ tab: "published" })).map(
        (n) => n.title,
      ),
    ).toContain("Staff meeting");
    expect(
      (await createCaller(as(parent, schoolA)).notices.list({ tab: "published" })).map(
        (n) => n.title,
      ),
    ).not.toContain("Staff meeting");
    expect(await code(createCaller(as(parent, schoolA)).notices.get({ id }))).toBe("NOT_FOUND");
    expect(
      (await createCaller(as(parent, schoolA)).notifications.list()).items.map((n) => n.title),
    ).not.toContain("Staff meeting");
  });

  it("switching approval off lets the School Admin publish directly", async () => {
    const adminApi = createCaller(as(admin, schoolA));
    const setup = await adminApi.setup.get();
    await adminApi.setup.updateProfile({
      name: setup.profile.name,
      address: "",
      affiliationNo: "",
      phone: "",
      logoFileId: null,
      noticeApprovalRequired: false,
    });
    const { id } = await draft(adminApi, {
      title: "Holiday on Monday",
      body: "School is closed on Monday.",
    });
    expect(await adminApi.notices.submit({ id })).toEqual({ status: "published" });
    await adminApi.setup.updateProfile({
      name: setup.profile.name,
      address: "",
      affiliationNo: "",
      phone: "",
      logoFileId: null,
      noticeApprovalRequired: true,
    });
  });

  it("only writers can write; drafts and rejected notices can be deleted, published ones cannot", async () => {
    expect(await code(draft(createCaller(as(teacher, schoolA))))).toBe("FORBIDDEN");
    expect(await code(draft(createCaller(as(parent, schoolA))))).toBe("FORBIDDEN");
    const adminApi = createCaller(as(admin, schoolA));
    const { id } = await draft(adminApi, { title: "Scratch", body: "Draft to delete" });
    expect(await adminApi.notices.delete({ id })).toEqual({ ok: true });
    const published = (await adminApi.notices.list({ tab: "published" }))[0];
    expect(await code(adminApi.notices.delete({ id: published?.id ?? "" }))).toBe(
      "PRECONDITION_FAILED",
    );
    // Someone else's draft is invisible and untouchable.
    const other = await draft(createCaller(as(principal, schoolA)), {
      title: "Private draft",
      body: "Not yours",
    });
    expect(await code(adminApi.notices.delete({ id: other.id }))).toBe("NOT_FOUND");
    expect(await code(adminApi.notices.get({ id: other.id }))).toBe("NOT_FOUND");
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await b.notices.list({ tab: "published" })).toEqual([]);
    const [a] = await createCaller(as(admin, schoolA)).notices.list({ tab: "published" });
    expect(await code(b.notices.get({ id: a?.id ?? "" }))).toBe("NOT_FOUND");
  });
});
