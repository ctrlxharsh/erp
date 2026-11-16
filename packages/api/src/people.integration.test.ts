import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import type { AuthAdmin } from "./auth-admin";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** People records, teacher scope and tenant isolation on the real Neon `test` database. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-0000000000f1";
const classTeacher = "00000000-0000-7000-8000-0000000000f2";
const otherTeacher = "00000000-0000-7000-8000-0000000000f3";
const parent = "00000000-0000-7000-8000-0000000000f4";
const adminB = "00000000-0000-7000-8000-0000000000f5";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("people", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `people-test-${Date.now()}`;
  const calls: string[] = [];
  const accounts = new Map<string, string>();
  let counter = 0;
  const authAdmin: AuthAdmin = {
    async findUserIdByEmail(email) {
      return accounts.get(email) ?? null;
    },
    async createUser({ email }) {
      const id = `00000000-0000-7000-8000-00000000e${String(++counter).padStart(3, "0")}`;
      accounts.set(email, id);
      calls.push(`create:${email}`);
      return { id };
    },
    async sendPasswordSetupEmail(email) {
      calls.push(`email:${email}`);
    },
  };

  let schoolA = "";
  let schoolB = "";
  let sectionA = "";
  let sectionB = "";
  let subjectId = "";

  const as = (userId: string, activeSchoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin,
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId,
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
      { userId: classTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: otherTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parent, schoolId: schoolA, roles: ["parent"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
    const adminApi = createCaller(as(admin, schoolA));
    await adminApi.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await adminApi.setup.createClass({ name: "Class 6" });
    await adminApi.setup.createSubject({ name: "Maths" });
    const setup = await adminApi.setup.get();
    const classId = setup.classes[0]?.id ?? "";
    subjectId = setup.subjects[0]?.id ?? "";
    await adminApi.setup.createSection({ classId, name: "A" });
    await adminApi.setup.createSection({ classId, name: "B" });
    const sections = (await adminApi.setup.get()).classes[0]?.sections ?? [];
    sectionA = sections.find((s) => s.name === "A")?.id ?? "";
    sectionB = sections.find((s) => s.name === "B")?.id ?? "";
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    await db
      .delete(schema.teacherAssignments)
      .where(inArray(schema.teacherAssignments.schoolId, ids));
    await db.delete(schema.studentGuardians).where(inArray(schema.studentGuardians.schoolId, ids));
    await db
      .delete(schema.studentEnrolments)
      .where(inArray(schema.studentEnrolments.schoolId, ids));
    for (const table of [
      schema.students,
      schema.guardians,
      schema.staff,
      schema.classSubjects,
      schema.sections,
      schema.classes,
      schema.subjects,
      schema.academicSessions,
      schema.schoolProfiles,
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    // Schools with audit events cannot be deleted (append-only log), so retire them.
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  const student = (over: Record<string, unknown> = {}) => ({
    admissionNo: "A-1",
    fullName: "Asha Verma",
    dateOfBirth: "2014-08-05",
    gender: "female" as const,
    admissionDate: "",
    sectionId: sectionA,
    consentConfirmed: true as const,
    guardians: [],
    ...over,
  });

  it("creates students with consent recorded and audited, and refuses duplicate admission numbers", async () => {
    const api = createCaller(as(admin, schoolA));
    const { id } = await api.people.students.create(
      student({
        guardians: [
          {
            fullName: "Ravi Verma",
            email: "ravi@example.com",
            phone: "98765 43210",
            relation: "Father",
          },
        ],
      }),
    );
    expect(await code(api.people.students.create(student()))).toBe("CONFLICT");
    const detail = await api.people.students.get({ id });
    expect(detail).toMatchObject({
      admissionNo: "A-1",
      className: "Class 6",
      sectionName: "A",
      status: "active",
    });
    expect(detail.guardians[0]).toMatchObject({
      fullName: "Ravi Verma",
      phone: "9876543210",
      relation: "Father",
    });
    const events = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.entityId, [id]));
    expect(events.map((e) => e.action)).toContain("student.created");
  });

  it("links one parent to several children (same email = same person)", async () => {
    const api = createCaller(as(admin, schoolA));
    const guardian = {
      fullName: "Ravi Verma",
      email: "RAVI@example.com",
      phone: "",
      relation: "Father",
    };
    const a = await api.people.students.create(
      student({ admissionNo: "A-2", fullName: "Brother One", guardians: [guardian] }),
    );
    const b = await api.people.students.create(
      student({
        admissionNo: "A-3",
        fullName: "Brother Two",
        sectionId: sectionB,
        guardians: [guardian],
      }),
    );
    const guardianA = (await api.people.students.get({ id: a.id })).guardians[0]?.id;
    const guardianB = (await api.people.students.get({ id: b.id })).guardians[0]?.id;
    expect(guardianA).toBeDefined();
    expect(guardianA).toBe(guardianB);
  });

  it("lists with search, section filter and paging", async () => {
    const api = createCaller(as(admin, schoolA));
    const all = await api.people.students.list({
      page: 1,
      pageSize: 10,
      search: "",
      sort: "name",
      direction: "asc",
    });
    expect(all.total).toBeGreaterThanOrEqual(3);
    const brothers = await api.people.students.list({
      page: 1,
      pageSize: 10,
      search: "brother",
      sort: "name",
      direction: "asc",
    });
    expect(brothers.items.map((s) => s.fullName)).toEqual(["Brother One", "Brother Two"]);
    const onlyB = await api.people.students.list({
      page: 1,
      pageSize: 10,
      search: "",
      sectionId: sectionB,
      sort: "name",
      direction: "asc",
    });
    expect(onlyB.items.map((s) => s.fullName)).toEqual(["Brother Two"]);
    const paged = await api.people.students.list({
      page: 2,
      pageSize: 2,
      search: "",
      sort: "admissionNo",
      direction: "asc",
    });
    expect(paged.items).toHaveLength(Math.min(2, all.total - 2));
  });

  it("assigns teachers: one class teacher and one teacher per subject per section", async () => {
    const api = createCaller(as(admin, schoolA));
    const t1 = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Meera Nair",
        email: "meera@example.com",
        phone: "",
      })
    ).id;
    const t2 = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Karan Shah",
        email: "karan@example.com",
        phone: "",
      })
    ).id;
    const clerk = (
      await api.people.staff.create({
        kind: "non_teaching",
        fullName: "Office Clerk",
        email: "",
        phone: "",
      })
    ).id;
    await db
      .update(schema.staff)
      .set({ userId: classTeacher })
      .where(inArray(schema.staff.id, [t1]));
    await db
      .update(schema.staff)
      .set({ userId: otherTeacher })
      .where(inArray(schema.staff.id, [t2]));
    expect(
      await code(
        api.people.staff.create({
          kind: "teacher",
          fullName: "Dup",
          email: "MEERA@example.com",
          phone: "",
        }),
      ),
    ).toBe("CONFLICT");

    await api.people.staff.assign({ staffId: t1, sectionId: sectionA, subjectId: null });
    expect(
      await code(api.people.staff.assign({ staffId: t2, sectionId: sectionA, subjectId: null })),
    ).toBe("CONFLICT");
    await api.people.staff.assign({ staffId: t2, sectionId: sectionA, subjectId });
    expect(
      await code(api.people.staff.assign({ staffId: t1, sectionId: sectionA, subjectId })),
    ).toBe("CONFLICT");
    expect(
      await code(api.people.staff.assign({ staffId: clerk, sectionId: sectionA, subjectId: null })),
    ).toBe("BAD_REQUEST");
    const detail = await api.people.staff.get({ id: t1 });
    expect(detail.assignments).toEqual([
      expect.objectContaining({ className: "Class 6", sectionName: "A", subjectId: null }),
    ]);
  });

  it("teachers see only students of sections they take", async () => {
    const mine = createCaller(as(classTeacher, schoolA));
    const seen = await mine.people.students.list({
      page: 1,
      pageSize: 50,
      search: "",
      sort: "name",
      direction: "asc",
    });
    expect(seen.items.every((s) => s.sectionName === "A")).toBe(true);
    expect(seen.items.map((s) => s.fullName)).not.toContain("Brother Two");
    const sectionBStudent = (
      await createCaller(as(admin, schoolA)).people.students.list({
        page: 1,
        pageSize: 5,
        search: "Brother Two",
        sort: "name",
        direction: "asc",
      })
    ).items[0];
    expect(await code(mine.people.students.get({ id: sectionBStudent?.id ?? "" }))).toBe(
      "NOT_FOUND",
    );
    // Teachers cannot change people or see the staff list.
    expect(await code(mine.people.students.create(student({ admissionNo: "X-9" })))).toBe(
      "FORBIDDEN",
    );
    expect(await code(mine.people.staff.list({ page: 1, pageSize: 10, search: "" }))).toBe(
      "FORBIDDEN",
    );
  });

  it("parents and students cannot reach people records", async () => {
    const asParent = createCaller(as(parent, schoolA));
    expect(
      await code(
        asParent.people.students.list({
          page: 1,
          pageSize: 10,
          search: "",
          sort: "name",
          direction: "asc",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("invites create an account once and add the matching role", async () => {
    const api = createCaller(as(admin, schoolA));
    const staffId = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Invitee Teacher",
        email: "invitee@example.com",
        phone: "",
      })
    ).id;
    expect(await api.people.invite({ kind: "staff", id: staffId })).toEqual({ emailSent: true });
    expect(calls).toContain("create:invitee@example.com");
    expect(calls).toContain("email:invitee@example.com");
    const before = calls.length;
    expect(await api.people.invite({ kind: "staff", id: staffId })).toEqual({ emailSent: false });
    expect(calls.length).toBe(before);
    const clerk =
      (await api.people.staff.list({ page: 1, pageSize: 10, search: "clerk" })).items[0]?.id ?? "";
    expect(await code(api.people.invite({ kind: "staff", id: clerk }))).toBe("BAD_REQUEST");
    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(inArray(schema.memberships.userId, [accounts.get("invitee@example.com") ?? ""]));
    expect(membership?.roles).toEqual(["teacher"]);
  });

  it("builds the Today summary for each role", async () => {
    // The parent of "Brother One" and "Brother Two" (same guardian record).
    await db
      .update(schema.guardians)
      .set({ userId: parent })
      .where(inArray(schema.guardians.schoolId, [schoolA]));
    const adminHome = await createCaller(as(admin, schoolA)).home.summary();
    expect(adminHome.counts?.classes).toBe(1);
    expect(adminHome.counts?.students).toBeGreaterThanOrEqual(3);
    expect(adminHome.counts?.teachers).toBeGreaterThanOrEqual(2);

    const teacherHome = await createCaller(as(classTeacher, schoolA)).home.summary();
    expect(teacherHome.counts).toBeNull();
    expect(teacherHome.mySections).toEqual([
      expect.objectContaining({ label: "Class 6 A", isClassTeacher: true }),
    ]);

    const parentHome = await createCaller(as(parent, schoolA)).home.summary();
    expect(parentHome.counts).toBeNull();
    expect(parentHome.children.map((c) => c.fullName)).toContain("Brother One");
    expect(parentHome.children.find((c) => c.fullName === "Brother Two")?.label).toBe("Class 6 B");
  });

  it("never shows or changes another school's people", async () => {
    const b = createCaller(as(adminB, schoolB));
    await b.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    expect(
      (
        await b.people.students.list({
          page: 1,
          pageSize: 10,
          search: "",
          sort: "name",
          direction: "asc",
        })
      ).total,
    ).toBe(0);
    expect((await b.people.staff.list({ page: 1, pageSize: 10, search: "" })).total).toBe(0);
    const foreign = (
      await createCaller(as(admin, schoolA)).people.students.list({
        page: 1,
        pageSize: 1,
        search: "",
        sort: "name",
        direction: "asc",
      })
    ).items[0];
    expect(await code(b.people.students.get({ id: foreign?.id ?? "" }))).toBe("NOT_FOUND");
    expect(await code(b.people.students.setStatus({ id: foreign?.id ?? "", status: "left" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await code(b.people.students.create(student({ admissionNo: "Z-1", sectionId: sectionA }))),
    ).toBe("BAD_REQUEST");
    const still = await createCaller(as(admin, schoolA)).people.students.get({
      id: foreign?.id ?? "",
    });
    expect(still.status).toBe("active");
  });
});
