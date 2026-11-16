import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Exams, marks, approval and results on the real Neon `test` database. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000701";
const principal = "00000000-0000-7000-8000-000000000702";
const mathsTeacher = "00000000-0000-7000-8000-000000000703";
const englishTeacher = "00000000-0000-7000-8000-000000000704";
const parentA = "00000000-0000-7000-8000-000000000705";
const parentB = "00000000-0000-7000-8000-000000000706";
const adminB = "00000000-0000-7000-8000-000000000707";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("exams and results", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `exams-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  let classId = "";
  let sectionA = "";
  let maths = "";
  let english = "";
  let examId = "";
  let asha = "";
  let ravi = "";
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
      { userId: mathsTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: englishTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parentA, schoolId: schoolA, roles: ["parent"] },
      { userId: parentB, schoolId: schoolA, roles: ["parent"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
    const api = createCaller(as(admin, schoolA));
    await api.setup.createSession({
      name: "2026-27",
      startDate: "2000-04-01",
      endDate: "2099-03-31",
    });
    await api.setup.createClass({ name: "Class 6" });
    await api.setup.createSubject({ name: "Maths" });
    await api.setup.createSubject({ name: "English" });
    let setup = await api.setup.get();
    classId = setup.classes[0]?.id ?? "";
    await api.setup.createSection({ classId, name: "A" });
    setup = await api.setup.get();
    sectionA = setup.classes[0]?.sections[0]?.id ?? "";
    maths = setup.subjects.find((s) => s.name === "Maths")?.id ?? "";
    english = setup.subjects.find((s) => s.name === "English")?.id ?? "";
    const t1 = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Maths Teacher",
        email: "",
        phone: "",
      })
    ).id;
    const t2 = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "English Teacher",
        email: "",
        phone: "",
      })
    ).id;
    await db
      .update(schema.staff)
      .set({ userId: mathsTeacher })
      .where(inArray(schema.staff.id, [t1]));
    await db
      .update(schema.staff)
      .set({ userId: englishTeacher })
      .where(inArray(schema.staff.id, [t2]));
    await api.people.staff.assign({ staffId: t1, sectionId: sectionA, subjectId: maths });
    await api.people.staff.assign({ staffId: t2, sectionId: sectionA, subjectId: english });
    const student = (name: string, no: string, email: string) =>
      api.people.students.create({
        admissionNo: no,
        fullName: name,
        dateOfBirth: "",
        gender: null,
        admissionDate: "",
        sectionId: sectionA,
        consentConfirmed: true,
        guardians: [{ fullName: `${name} Parent`, email, phone: "", relation: "" }],
      });
    asha = (await student("Asha Verma", "1", "exams-a@example.com")).id;
    ravi = (await student("Ravi Kumar", "2", "exams-b@example.com")).id;
    await db
      .update(schema.guardians)
      .set({ userId: parentA })
      .where(inArray(schema.guardians.email, ["exams-a@example.com"]));
    await db
      .update(schema.guardians)
      .set({ userId: parentB })
      .where(inArray(schema.guardians.email, ["exams-b@example.com"]));
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.notifications,
      schema.marks,
      schema.resultBatches,
      schema.examSubjects,
      schema.exams,
      schema.gradeBands,
      schema.teacherAssignments,
      schema.studentGuardians,
      schema.studentEnrolments,
      schema.students,
      schema.guardians,
      schema.staff,
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

  const key = (subjectId: string) => ({ examId, sectionId: sectionA, subjectId });

  it("seeds the CBSE grade scale, and only valid scales can be saved", async () => {
    const api = createCaller(as(admin, schoolA));
    const bands = await api.grades.get();
    expect(bands[0]).toEqual({ grade: "A1", minPercent: 91, gradePoint: 10 });
    expect(bands).toHaveLength(9);
    expect(
      await code(
        api.grades.save({
          bands: [
            { grade: "A", minPercent: 50, gradePoint: 1 },
            { grade: "B", minPercent: 40, gradePoint: 0 },
          ],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(await code(createCaller(as(mathsTeacher, schoolA)).grades.save({ bands }))).toBe(
      "FORBIDDEN",
    );
  });

  it("the School Admin builds the exam schedule; teachers cannot", async () => {
    const api = createCaller(as(admin, schoolA));
    examId = (await api.exams.create({ name: "Term 1" })).id;
    expect(await code(api.exams.create({ name: "Term 1" }))).toBe("CONFLICT");
    await api.exams.saveSubject({
      examId,
      classId,
      subjectId: maths,
      date: "2026-12-01",
      startTime: "09:30",
      maxMarks: 100,
    });
    await api.exams.saveSubject({
      examId,
      classId,
      subjectId: english,
      date: "2026-12-03",
      startTime: "",
      maxMarks: 50,
    });
    const schedule = await api.exams.schedule({ examId });
    expect(schedule.map((s) => [s.subjectName, s.date, s.startTime, s.maxMarks])).toEqual([
      ["Maths", "2026-12-01", "09:30", 100],
      ["English", "2026-12-03", null, 50],
    ]);
    expect((await api.exams.list())[0]).toMatchObject({ name: "Term 1", subjectCount: 2 });
    expect(await code(createCaller(as(mathsTeacher, schoolA)).exams.create({ name: "Nope" }))).toBe(
      "FORBIDDEN",
    );
  });

  it("a teacher enters marks for their own subject, validated against the maximum", async () => {
    const teacher = createCaller(as(mathsTeacher, schoolA));
    const available = await teacher.marks.available();
    expect(available).toEqual([
      expect.objectContaining({
        examName: "Term 1",
        subjectName: "Maths",
        sectionLabel: "Class 6 A",
        maxMarks: 100,
        status: "draft",
        id: null,
      }),
    ]);
    expect(
      await code(
        teacher.marks.save({
          ...key(english),
          entries: [{ studentId: asha, marks: 10, absent: false }],
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await code(
        teacher.marks.save({
          ...key(maths),
          entries: [{ studentId: asha, marks: 101, absent: false }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await code(
        teacher.marks.save({
          ...key(maths),
          entries: [{ studentId: asha, marks: 50, absent: true }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    await teacher.marks.save({
      ...key(maths),
      entries: [{ studentId: asha, marks: 87.5, absent: false }],
    });
    // Cannot send until everyone has a mark or is absent.
    expect(await code(teacher.marks.submit(key(maths)))).toBe("BAD_REQUEST");
    await teacher.marks.save({
      ...key(maths),
      entries: [{ studentId: ravi, marks: null, absent: true }],
    });
    const sheet = await teacher.marks.sheet(key(maths));
    expect(sheet.canEdit).toBe(true);
    expect(sheet.students).toEqual([
      { id: asha, fullName: "Asha Verma", marks: 87.5, absent: false },
      { id: ravi, fullName: "Ravi Kumar", marks: null, absent: true },
    ]);
    // The schedule's maximum cannot change once marks exist.
    expect(
      await code(
        createCaller(as(admin, schoolA)).exams.saveSubject({
          examId,
          classId,
          subjectId: maths,
          date: "2026-12-01",
          startTime: "",
          maxMarks: 80,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await code(
        createCaller(as(admin, schoolA)).exams.removeSubject({
          id: (await createCaller(as(admin, schoolA)).exams.schedule({ examId }))[0]?.id ?? "",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    await teacher.marks.submit(key(maths));
    expect(
      await code(
        teacher.marks.save({
          ...key(maths),
          entries: [{ studentId: asha, marks: 90, absent: false }],
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(await code(teacher.marks.submit(key(maths)))).toBe("PRECONDITION_FAILED");
  });

  it("the Principal approves or sends back; a rejected batch is fixed and resent", async () => {
    const principalApi = createCaller(as(principal, schoolA));
    expect((await principalApi.notifications.list()).items.map((n) => n.kind)).toContain(
      "marks.submitted",
    );
    const list = await principalApi.results.review({});
    expect(list).toEqual([
      expect.objectContaining({
        subjectName: "Maths",
        status: "submitted",
        teacherName: "Maths Teacher",
      }),
    ]);
    // Others cannot decide.
    expect(await code(createCaller(as(admin, schoolA)).results.approve(key(maths)))).toBe(
      "FORBIDDEN",
    );
    expect(await code(createCaller(as(mathsTeacher, schoolA)).results.approve(key(maths)))).toBe(
      "FORBIDDEN",
    );
    expect(await code(principalApi.results.reject({ ...key(maths), comment: "" }))).toBe(
      "BAD_REQUEST",
    );
    await principalApi.results.reject({ ...key(maths), comment: "Check Asha's marks" });
    const teacher = createCaller(as(mathsTeacher, schoolA));
    expect((await teacher.notifications.list()).items.map((n) => n.title)).toContain(
      "Your marks were sent back",
    );
    expect((await teacher.marks.available())[0]).toMatchObject({
      status: "rejected",
      decisionComment: "Check Asha's marks",
    });
    await teacher.marks.save({
      ...key(maths),
      entries: [{ studentId: asha, marks: 88, absent: false }],
    });
    await teacher.marks.submit(key(maths));
    await principalApi.results.approve(key(maths));
    expect(await code(principalApi.results.approve(key(maths)))).toBe("PRECONDITION_FAILED");
  });

  it("students and parents see marks only after publishing, and only their own", async () => {
    const parent = createCaller(as(parentA, schoolA));
    const before = await parent.results.reportCard({ examId, studentId: asha });
    expect(before.rows.map((r) => [r.subject, r.published])).toEqual([
      ["English", false],
      ["Maths", false],
    ]);
    expect(before.summary.totalMax).toBe(0);
    expect(
      await code(
        createCaller(as(parentB, schoolA)).results.reportCard({ examId, studentId: asha }),
      ),
    ).toBe("NOT_FOUND");

    const principalApi = createCaller(as(principal, schoolA));
    expect(await code(principalApi.results.publish({ batches: [key(english)] }))).toBe(
      "PRECONDITION_FAILED",
    );
    await principalApi.results.publish({ batches: [key(maths)] });
    expect((await parent.notifications.list()).items.map((n) => n.title)).toContain(
      "Results published: Term 1",
    );
    const partial = await parent.results.reportCard({ examId, studentId: asha });
    expect(partial.complete).toBe(false);
    expect(partial.rows.find((r) => r.subject === "Maths")).toMatchObject({
      marks: 88,
      max: 100,
      percent: 88,
      grade: "A2",
      published: true,
    });
    expect(partial.summary).toEqual({
      totalMarks: 88,
      totalMax: 100,
      percent: 88,
      grade: "A2",
      gradePoint: 9,
    });
    expect(
      (
        await createCaller(as(parentB, schoolA)).results.reportCard({ examId, studentId: ravi })
      ).rows.find((r) => r.subject === "Maths"),
    ).toMatchObject({ marks: null, absent: true, published: true });
  });

  it("completes the report card when every subject is published, with an admit card for the schedule", async () => {
    const english$ = createCaller(as(englishTeacher, schoolA));
    await english$.marks.save({
      ...key(english),
      entries: [
        { studentId: asha, marks: 41, absent: false },
        { studentId: ravi, marks: 20, absent: false },
      ],
    });
    await english$.marks.submit(key(english));
    const principalApi = createCaller(as(principal, schoolA));
    await principalApi.results.approve(key(english));
    await principalApi.results.publish({ batches: [key(english)] });
    const parent = createCaller(as(parentA, schoolA));
    const card = await parent.results.reportCard({ examId, studentId: asha });
    expect(card.complete).toBe(true);
    expect(card.summary).toEqual({
      totalMarks: 129,
      totalMax: 150,
      percent: 86,
      grade: "A2",
      gradePoint: 9,
    });
    expect(await parent.results.mine({ studentId: asha })).toEqual([
      { examId, examName: "Term 1", publishedSubjects: 2, scheduledSubjects: 2 },
    ]);
    const admit = await parent.results.admitCard({ examId, studentId: asha });
    expect(admit.student).toMatchObject({
      fullName: "Asha Verma",
      className: "Class 6",
      sectionName: "A",
    });
    expect(admit.schedule.map((s) => [s.subject, s.date])).toEqual([
      ["Maths", "2026-12-01"],
      ["English", "2026-12-03"],
    ]);
    expect(
      await code(createCaller(as(parentB, schoolA)).results.admitCard({ examId, studentId: asha })),
    ).toBe("NOT_FOUND");
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await b.exams.list()).toEqual([]);
    await b.setup.createSession({
      name: "2026-27",
      startDate: "2000-04-01",
      endDate: "2099-03-31",
    });
    expect(await b.exams.schedule({ examId })).toEqual([]);
    expect(
      await code(
        b.exams.saveSubject({
          examId,
          classId,
          subjectId: maths,
          date: "2026-12-01",
          startTime: "",
          maxMarks: 10,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });
});
