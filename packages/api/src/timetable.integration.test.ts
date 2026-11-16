import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Timetable on the real Neon `test` database. Skipped without DATABASE_URL. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000301";
const teacherUser = "00000000-0000-7000-8000-000000000302";
const adminB = "00000000-0000-7000-8000-000000000303";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("timetable", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `timetable-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  let sectionA = "";
  let sectionB = "";
  let maths = "";
  let english = "";
  let meera = "";
  let karan = "";
  const as = (userId: string, schoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: null as never,
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
      { userId: teacherUser, schoolId: schoolA, roles: ["teacher"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
    const api = createCaller(as(admin, schoolA));
    await api.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await api.setup.createClass({ name: "Class 6" });
    await api.setup.createSubject({ name: "Maths" });
    await api.setup.createSubject({ name: "English" });
    const setup = await api.setup.get();
    const classId = setup.classes[0]?.id ?? "";
    maths = setup.subjects.find((s) => s.name === "Maths")?.id ?? "";
    english = setup.subjects.find((s) => s.name === "English")?.id ?? "";
    await api.setup.createSection({ classId, name: "A" });
    await api.setup.createSection({ classId, name: "B" });
    const sections = (await api.setup.get()).classes[0]?.sections ?? [];
    sectionA = sections.find((s) => s.name === "A")?.id ?? "";
    sectionB = sections.find((s) => s.name === "B")?.id ?? "";
    meera = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Meera Nair",
        email: "",
        phone: "",
      })
    ).id;
    karan = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Karan Shah",
        email: "",
        phone: "",
      })
    ).id;
    await db
      .update(schema.staff)
      .set({ userId: teacherUser })
      .where(inArray(schema.staff.id, [meera]));
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.timetableEntries,
      schema.timetablePeriods,
      schema.teacherAssignments,
      schema.staff,
      schema.classSubjects,
      schema.sections,
      schema.classes,
      schema.subjects,
      schema.academicSessions,
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  it("manages periods and refuses bad times and duplicate names", async () => {
    const api = createCaller(as(admin, schoolA));
    await api.timetable.savePeriod({ name: "Period 1", startTime: "08:30", endTime: "09:15" });
    await api.timetable.savePeriod({ name: "Period 2", startTime: "09:15", endTime: "10:00" });
    expect(
      await code(
        api.timetable.savePeriod({ name: "Period 1", startTime: "11:00", endTime: "11:45" }),
      ),
    ).toBe("CONFLICT");
    expect(
      await code(api.timetable.savePeriod({ name: "Bad", startTime: "10:00", endTime: "09:00" })),
    ).toBe("BAD_REQUEST");
    const periods = await api.timetable.periods();
    expect(periods.map((p) => [p.name, p.startTime, p.endTime])).toEqual([
      ["Period 1", "08:30", "09:15"],
      ["Period 2", "09:15", "10:00"],
    ]);
    const first = periods[0];
    await api.timetable.savePeriod({
      id: first?.id,
      name: "Period 1",
      startTime: "08:35",
      endTime: "09:15",
    });
    expect((await api.timetable.periods())[0]?.startTime).toBe("08:35");
  });

  it("fills a section's week and warns when a teacher is double-booked", async () => {
    const api = createCaller(as(admin, schoolA));
    const [p1, p2] = await api.timetable.periods();
    const slot = { weekday: 1, periodId: p1?.id ?? "" };
    expect(
      await api.timetable.setEntry({
        sectionId: sectionA,
        ...slot,
        subjectId: maths,
        staffId: meera,
      }),
    ).toEqual({ conflicts: [] });
    // Same teacher, same slot, other section: saved, but reported.
    expect(
      await api.timetable.setEntry({
        sectionId: sectionB,
        ...slot,
        subjectId: english,
        staffId: meera,
      }),
    ).toEqual({ conflicts: ["Class 6 A"] });
    // Replacing a slot keeps one entry per slot.
    await api.timetable.setEntry({
      sectionId: sectionA,
      ...slot,
      subjectId: english,
      staffId: karan,
    });
    await api.timetable.setEntry({
      sectionId: sectionA,
      weekday: 2,
      periodId: p2?.id ?? "",
      subjectId: maths,
      staffId: karan,
    });
    const grid = await api.timetable.forSection({ sectionId: sectionA });
    expect(grid.entries).toHaveLength(2);
    expect(grid.entries.find((e) => e.weekday === 1)).toMatchObject({
      subjectName: "English",
      staffName: "Karan Shah",
      sectionLabel: "Class 6 A",
    });
    await api.timetable.clearEntry({ sectionId: sectionA, weekday: 2, periodId: p2?.id ?? "" });
    expect((await api.timetable.forSection({ sectionId: sectionA })).entries).toHaveLength(1);
  });

  it("shows a teacher their own week", async () => {
    const mine = await createCaller(as(teacherUser, schoolA)).timetable.mine();
    expect(mine.entries.map((e) => [e.sectionLabel, e.subjectName])).toEqual([
      ["Class 6 B", "English"],
    ]);
  });

  it("only the School Admin can change it; everyone can read it", async () => {
    const teacher = createCaller(as(teacherUser, schoolA));
    const [p1] = await teacher.timetable.periods();
    expect(
      await code(
        teacher.timetable.setEntry({
          sectionId: sectionA,
          weekday: 3,
          periodId: p1?.id ?? "",
          subjectId: maths,
          staffId: null,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(teacher.timetable.savePeriod({ name: "X", startTime: "01:00", endTime: "02:00" })),
    ).toBe("FORBIDDEN");
    expect((await teacher.timetable.forSection({ sectionId: sectionA })).entries.length).toBe(1);
  });

  it("will not delete a period that is in use", async () => {
    const api = createCaller(as(admin, schoolA));
    const [p1, p2] = await api.timetable.periods();
    expect(await code(api.timetable.deletePeriod({ id: p1?.id ?? "" }))).toBe(
      "PRECONDITION_FAILED",
    );
    expect(await code(api.timetable.deletePeriod({ id: p2?.id ?? "" }))).toBe("OK");
  });

  it("keeps schools apart and rejects foreign ids", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect((await b.timetable.periods()).length).toBe(0);
    await b.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    expect((await b.timetable.forSection({ sectionId: sectionA })).entries).toEqual([]);
    const aPeriod = (await createCaller(as(admin, schoolA)).timetable.periods())[0];
    expect(
      await code(
        b.timetable.setEntry({
          sectionId: sectionA,
          weekday: 1,
          periodId: aPeriod?.id ?? "",
          subjectId: maths,
          staffId: null,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
