import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** School setup and tenant isolation on the real Neon `test` database. Skipped without DATABASE_URL. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const adminA = "00000000-0000-7000-8000-0000000000e1";
const teacherA = "00000000-0000-7000-8000-0000000000e2";
const adminB = "00000000-0000-7000-8000-0000000000e3";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("school setup", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `setup-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";

  const as = (userId: string, activeSchoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: null as never,
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
      { userId: adminA, schoolId: schoolA, roles: ["school_admin"] },
      { userId: teacherA, schoolId: schoolA, roles: ["teacher"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.classSubjects,
      schema.sections,
      schema.classes,
      schema.subjects,
      schema.academicSessions,
      schema.schoolProfiles,
      schema.memberships,
    ]) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    await db.delete(schema.schools).where(inArray(schema.schools.id, ids));
  });

  it("saves the school profile and renames the school", async () => {
    const api = createCaller(as(adminA, schoolA));
    await api.setup.updateProfile({
      name: `${tag}-A Renamed`,
      address: "12 Station Road",
      affiliationNo: "2130123",
      phone: "",
      logoFileId: null,
    });
    const { profile } = await api.setup.get();
    expect(profile).toMatchObject({
      name: `${tag}-A Renamed`,
      address: "12 Station Road",
      affiliationNo: "2130123",
      phone: null,
    });
  });

  it("keeps exactly one active session and refuses duplicates", async () => {
    const api = createCaller(as(adminA, schoolA));
    await api.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await api.setup.createSession({
      name: "2027-28",
      startDate: "2027-04-01",
      endDate: "2028-03-31",
    });
    let { sessions } = await api.setup.get();
    expect(sessions.filter((s) => s.isActive).map((s) => s.name)).toEqual(["2026-27"]);
    expect(
      await code(
        api.setup.createSession({
          name: "2026-27",
          startDate: "2026-04-01",
          endDate: "2027-03-31",
        }),
      ),
    ).toBe("CONFLICT");

    const next = sessions.find((s) => s.name === "2027-28");
    await api.setup.activateSession({ id: next?.id ?? "" });
    ({ sessions } = await api.setup.get());
    expect(sessions.filter((s) => s.isActive).map((s) => s.name)).toEqual(["2027-28"]);
  });

  it("builds classes, sections and subjects and links them", async () => {
    const api = createCaller(as(adminA, schoolA));
    await api.setup.createClass({ name: "Class 6" });
    await api.setup.createSubject({ name: "Maths" });
    await api.setup.createSubject({ name: "English" });
    let setup = await api.setup.get();
    const cls = setup.classes[0];
    await api.setup.createSection({ classId: cls?.id ?? "", name: "A" });
    await api.setup.createSection({ classId: cls?.id ?? "", name: "B" });
    expect(await code(api.setup.createSection({ classId: cls?.id ?? "", name: "A" }))).toBe(
      "CONFLICT",
    );
    expect(await code(api.setup.createClass({ name: "Class 6" }))).toBe("CONFLICT");
    await api.setup.setClassSubjects({
      classId: cls?.id ?? "",
      subjectIds: setup.subjects.map((s) => s.id),
    });
    setup = await api.setup.get();
    expect(setup.classes[0]?.sections.map((s) => s.name)).toEqual(["A", "B"]);
    expect(setup.classes[0]?.subjectIds).toHaveLength(2);
    // A class with sections cannot be deleted until they are removed.
    expect(await code(api.setup.deleteClass({ id: cls?.id ?? "" }))).toBe("PRECONDITION_FAILED");
  });

  it("lets staff read the setup but only the School Admin change it", async () => {
    const teacher = createCaller(as(teacherA, schoolA));
    expect((await teacher.setup.get()).classes.length).toBeGreaterThan(0);
    expect(await code(teacher.setup.createClass({ name: "Class 7" }))).toBe("FORBIDDEN");
    expect(
      await code(
        teacher.setup.updateProfile({
          name: "Hacked",
          address: "",
          affiliationNo: "",
          phone: "",
          logoFileId: null,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("never shows or changes another school's setup", async () => {
    const b = createCaller(as(adminB, schoolB));
    const seen = await b.setup.get();
    expect(seen.classes).toEqual([]);
    expect(seen.sessions).toEqual([]);
    expect(seen.subjects).toEqual([]);

    const a = await createCaller(as(adminA, schoolA)).setup.get();
    const foreignClass = a.classes[0]?.id ?? "";
    const foreignSubject = a.subjects[0]?.id ?? "";
    expect(await code(b.setup.createSection({ classId: foreignClass, name: "Z" }))).toBe(
      "NOT_FOUND",
    );
    expect(await code(b.setup.setClassSubjects({ classId: foreignClass, subjectIds: [] }))).toBe(
      "NOT_FOUND",
    );
    await b.setup.deleteSubject({ id: foreignSubject });
    await b.setup.activateSession({ id: a.sessions[0]?.id ?? "" }).catch(() => undefined);
    // School A's data is untouched.
    const after = await createCaller(as(adminA, schoolA)).setup.get();
    expect(after.subjects).toHaveLength(2);
    expect(after.sessions.filter((s) => s.isActive)).toHaveLength(1);
  });

  it("rejects a logo that is not a finished upload of this school", async () => {
    const api = createCaller(as(adminA, schoolA));
    expect(
      await code(
        api.setup.updateProfile({
          name: `${tag}-A`,
          address: "",
          affiliationNo: "",
          phone: "",
          logoFileId: "00000000-0000-7000-8000-0000000000ff",
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
