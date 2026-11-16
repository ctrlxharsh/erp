import { createDb, schema } from "@erp/db";
import { schoolToday } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Homework, class diary and study material on the real Neon `test` database. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000501";
const mathsTeacher = "00000000-0000-7000-8000-000000000502";
const englishTeacher = "00000000-0000-7000-8000-000000000503";
const parentA = "00000000-0000-7000-8000-000000000504";
const parentB = "00000000-0000-7000-8000-000000000505";
const studentUser = "00000000-0000-7000-8000-000000000506";
const adminB = "00000000-0000-7000-8000-000000000507";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

const dayOffset = (days: number) => {
  const d = new Date(`${schoolToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

run("classwork", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `classwork-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  let sectionA = "";
  let sectionB = "";
  let classId = "";
  let maths = "";
  let english = "";
  let asha = "";
  let ravi = "";
  const as = (userId: string, schoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: null as never,
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId: schoolId,
  });
  const fakeFile = async (purpose: "homework_attachment" | "study_material", owner: string) => {
    const [file] = await db
      .insert(schema.files)
      .values({
        schoolId: schoolA,
        purpose,
        status: "ready",
        mime: "application/pdf",
        sizeBytes: 10,
        key: `test/${tag}/${Math.random()}`,
        ownerUserId: owner,
      })
      .returning({ id: schema.files.id });
    return file?.id ?? "";
  };

  beforeAll(async () => {
    const [a, b] = await db
      .insert(schema.schools)
      .values([{ name: `${tag}-A` }, { name: `${tag}-B` }])
      .returning({ id: schema.schools.id });
    schoolA = a?.id ?? "";
    schoolB = b?.id ?? "";
    await db.insert(schema.memberships).values([
      { userId: admin, schoolId: schoolA, roles: ["school_admin"] },
      { userId: mathsTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: englishTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parentA, schoolId: schoolA, roles: ["parent"] },
      { userId: parentB, schoolId: schoolA, roles: ["parent"] },
      { userId: studentUser, schoolId: schoolA, roles: ["student"] },
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
    await api.setup.createSection({ classId, name: "B" });
    setup = await api.setup.get();
    sectionA = setup.classes[0]?.sections.find((s) => s.name === "A")?.id ?? "";
    sectionB = setup.classes[0]?.sections.find((s) => s.name === "B")?.id ?? "";
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
    await api.people.staff.assign({ staffId: t2, sectionId: sectionB, subjectId: english });
    const student = (name: string, no: string, sectionId: string, email: string) =>
      api.people.students.create({
        admissionNo: no,
        fullName: name,
        dateOfBirth: "",
        gender: null,
        admissionDate: "",
        sectionId,
        consentConfirmed: true,
        guardians: [{ fullName: `${name} Parent`, email, phone: "", relation: "" }],
      });
    asha = (await student("Asha Verma", "1", sectionA, "classwork-a@example.com")).id;
    ravi = (await student("Ravi Kumar", "2", sectionB, "classwork-b@example.com")).id;
    await db
      .update(schema.guardians)
      .set({ userId: parentA })
      .where(inArray(schema.guardians.email, ["classwork-a@example.com"]));
    await db
      .update(schema.guardians)
      .set({ userId: parentB })
      .where(inArray(schema.guardians.email, ["classwork-b@example.com"]));
    await db
      .update(schema.students)
      .set({ userId: studentUser })
      .where(inArray(schema.students.id, [asha]));
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.notifications,
      schema.homeworkStatus,
      schema.homeworkAttachments,
      schema.homework,
      schema.classDiaryEntries,
      schema.studyMaterials,
      schema.files,
      schema.teacherAssignments,
      schema.studentGuardians,
      schema.studentEnrolments,
      schema.students,
      schema.guardians,
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

  it("a teacher sets homework only for their own class and subject, and students and parents are told", async () => {
    const teacher = createCaller(as(mathsTeacher, schoolA));
    const base = {
      sectionId: sectionA,
      subjectId: maths,
      title: "Fractions worksheet",
      details: "Page 12",
      dueDate: dayOffset(3),
      isGraded: true,
      maxMarks: 20,
      fileIds: [] as string[],
    };
    expect(await code(teacher.classwork.homework.create({ ...base, subjectId: english }))).toBe(
      "FORBIDDEN",
    );
    expect(await code(teacher.classwork.homework.create({ ...base, sectionId: sectionB }))).toBe(
      "FORBIDDEN",
    );
    expect(await code(teacher.classwork.homework.create({ ...base, dueDate: dayOffset(-1) }))).toBe(
      "BAD_REQUEST",
    );
    expect(await code(createCaller(as(admin, schoolA)).classwork.homework.create(base))).toBe(
      "FORBIDDEN",
    );
    const attachment = await fakeFile("homework_attachment", mathsTeacher);
    const { id } = await teacher.classwork.homework.create({ ...base, fileIds: [attachment] });
    expect(
      await code(
        teacher.classwork.homework.create({
          ...base,
          fileIds: [await fakeFile("homework_attachment", englishTeacher)],
        }),
      ),
    ).toBe("BAD_REQUEST");
    const alerts = await createCaller(as(parentA, schoolA)).notifications.list();
    expect(alerts.items[0]).toMatchObject({
      kind: "homework.published",
      title: "New homework: Fractions worksheet",
    });
    expect((await createCaller(as(studentUser, schoolA)).notifications.list()).items).toHaveLength(
      1,
    );
    expect((await createCaller(as(parentB, schoolA)).notifications.list()).items).toEqual([]);
    const listed = await teacher.classwork.homework.list({ sectionId: sectionA });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id,
      subjectName: "Maths",
      sectionLabel: "Class 6 A",
      maxMarks: 20,
      attachmentIds: [attachment],
    });
  });

  it("the teacher records status and marks; marks cannot exceed the maximum", async () => {
    const teacher = createCaller(as(mathsTeacher, schoolA));
    const [hw] = await teacher.classwork.homework.list({ sectionId: sectionA });
    const homeworkId = hw?.id ?? "";
    expect(
      await code(
        teacher.classwork.homework.setStatus({
          homeworkId,
          entries: [{ studentId: asha, status: "submitted", marks: 25 }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await code(
        teacher.classwork.homework.setStatus({
          homeworkId,
          entries: [{ studentId: ravi, status: "submitted", marks: null }],
        }),
      ),
    ).toBe("BAD_REQUEST");
    await teacher.classwork.homework.setStatus({
      homeworkId,
      entries: [{ studentId: asha, status: "late", marks: 17.5 }],
    });
    const roster = await teacher.classwork.homework.roster({ homeworkId });
    expect(roster.canManage).toBe(true);
    expect(roster.students).toEqual([
      { id: asha, fullName: "Asha Verma", status: "late", marks: 17.5 },
    ]);
    expect(
      await code(
        createCaller(as(englishTeacher, schoolA)).classwork.homework.setStatus({
          homeworkId,
          entries: [{ studentId: asha, status: "submitted", marks: null }],
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("students and parents see their own status; others see nothing of it", async () => {
    const asParent = createCaller(as(parentA, schoolA));
    const [mine] = await asParent.classwork.homework.list({ studentId: asha });
    expect(mine).toMatchObject({ status: "late", marks: 17.5 });
    expect(
      (await createCaller(as(studentUser, schoolA)).classwork.homework.list({ studentId: asha }))[0]
        ?.status,
    ).toBe("late");
    expect(
      await code(createCaller(as(parentB, schoolA)).classwork.homework.list({ studentId: asha })),
    ).toBe("NOT_FOUND");
    // The other family sees no homework of section A, and the class list stays hidden from parents.
    expect(await createCaller(as(parentB, schoolA)).classwork.homework.list({})).toEqual([]);
    const roster = await asParent.classwork.homework.roster({ homeworkId: mine?.id ?? "" });
    expect(roster.canManage).toBe(false);
    expect(roster.students).toEqual([]);
    // The admin sees the whole class list but cannot change it.
    expect(
      (
        await createCaller(as(admin, schoolA)).classwork.homework.roster({
          homeworkId: mine?.id ?? "",
        })
      ).students,
    ).toHaveLength(1);
  });

  it("the diary keeps one entry per class, subject and day, and refuses future dates", async () => {
    const teacher = createCaller(as(mathsTeacher, schoolA));
    const entry = {
      sectionId: sectionA,
      subjectId: maths,
      date: schoolToday(),
      topic: "Adding fractions",
      notes: "",
    };
    await teacher.classwork.diary.save(entry);
    await teacher.classwork.diary.save({
      ...entry,
      topic: "Adding and subtracting fractions",
      notes: "Revise tomorrow",
    });
    expect(await code(teacher.classwork.diary.save({ ...entry, date: dayOffset(1) }))).toBe(
      "BAD_REQUEST",
    );
    expect(await code(teacher.classwork.diary.save({ ...entry, subjectId: english }))).toBe(
      "FORBIDDEN",
    );
    const range = { sectionId: sectionA, from: dayOffset(-7), to: schoolToday() };
    const rows = await createCaller(as(parentA, schoolA)).classwork.diary.list(range);
    expect(rows).toEqual([
      expect.objectContaining({
        topic: "Adding and subtracting fractions",
        notes: "Revise tomorrow",
        subjectName: "Maths",
        teacherName: "Maths Teacher",
      }),
    ]);
    expect(await createCaller(as(parentB, schoolA)).classwork.diary.list(range)).toEqual([]);
    expect((await createCaller(as(admin, schoolA)).classwork.diary.list(range)).length).toBe(1);
  });

  it("study material goes to a class and is checked against the teacher's assignment and own upload", async () => {
    const teacher = createCaller(as(mathsTeacher, schoolA));
    const file = await fakeFile("study_material", mathsTeacher);
    expect(
      await code(
        teacher.classwork.material.create({
          classId,
          subjectId: english,
          title: "Nope",
          fileId: file,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        teacher.classwork.material.create({
          classId,
          subjectId: maths,
          title: "Not mine",
          fileId: await fakeFile("study_material", englishTeacher),
        }),
      ),
    ).toBe("BAD_REQUEST");
    await teacher.classwork.material.create({
      classId,
      subjectId: maths,
      title: "Fractions notes",
      fileId: file,
    });
    expect(
      (await createCaller(as(parentA, schoolA)).classwork.material.list({})).map((m) => m.title),
    ).toEqual(["Fractions notes"]);
    expect(
      (await createCaller(as(studentUser, schoolA)).classwork.material.list({}))[0],
    ).toMatchObject({ className: "Class 6", subjectName: "Maths" });
    expect(
      await code(
        createCaller(as(parentA, schoolA)).classwork.material.create({
          classId,
          subjectId: maths,
          title: "x",
          fileId: file,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await b.classwork.homework.list({})).toEqual([]);
    expect(await b.classwork.material.list({})).toEqual([]);
    const [hw] = await createCaller(as(mathsTeacher, schoolA)).classwork.homework.list({
      sectionId: sectionA,
    });
    expect(await code(b.classwork.homework.roster({ homeworkId: hw?.id ?? "" }))).toBe("NOT_FOUND");
  });
});
