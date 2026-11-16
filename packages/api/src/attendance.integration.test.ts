import { createDb, schema } from "@erp/db";
import { schoolToday } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Attendance on the real Neon `test` database. Skipped without DATABASE_URL. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000401";
const classTeacher = "00000000-0000-7000-8000-000000000402";
const subjectTeacher = "00000000-0000-7000-8000-000000000403";
const parentUser = "00000000-0000-7000-8000-000000000404";
const otherParent = "00000000-0000-7000-8000-000000000405";
const adminB = "00000000-0000-7000-8000-000000000406";

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

run("attendance", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `attendance-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  let sectionA = "";
  let asha = "";
  let ravi = "";
  let teacherStaff = "";
  let clerk = "";
  const as = (userId: string, schoolId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: { send: async () => undefined },
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId: schoolId,
  });
  const today = schoolToday();
  const yesterday = dayOffset(-1);

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
      { userId: subjectTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parentUser, schoolId: schoolA, roles: ["parent"] },
      { userId: otherParent, schoolId: schoolA, roles: ["parent"] },
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
    const setup = await api.setup.get();
    await api.setup.createSection({ classId: setup.classes[0]?.id ?? "", name: "A" });
    const setup2 = await api.setup.get();
    sectionA = setup2.classes[0]?.sections[0]?.id ?? "";
    const subject = setup2.subjects[0]?.id ?? "";
    teacherStaff = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Meera Nair",
        email: "",
        phone: "",
      })
    ).id;
    const other = (
      await api.people.staff.create({
        kind: "teacher",
        fullName: "Karan Shah",
        email: "",
        phone: "",
      })
    ).id;
    clerk = (
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
      .where(inArray(schema.staff.id, [teacherStaff]));
    await db
      .update(schema.staff)
      .set({ userId: subjectTeacher })
      .where(inArray(schema.staff.id, [other]));
    await api.people.staff.assign({ staffId: teacherStaff, sectionId: sectionA, subjectId: null });
    await api.people.staff.assign({ staffId: other, sectionId: sectionA, subjectId: subject });
    const student = (name: string, no: string, guardians: object[] = []) =>
      api.people.students.create({
        admissionNo: no,
        fullName: name,
        dateOfBirth: "",
        gender: null,
        admissionDate: "",
        sectionId: sectionA,
        consentConfirmed: true,
        guardians: guardians as never,
      });
    asha = (
      await student("Asha Verma", "1", [
        {
          fullName: "Ravi Verma",
          email: "attendance-ravi@example.com",
          phone: "",
          relation: "Father",
        },
      ])
    ).id;
    ravi = (
      await student("Ravi Kumar", "2", [
        {
          fullName: "Other Parent",
          email: "attendance-other@example.com",
          phone: "",
          relation: "Mother",
        },
      ])
    ).id;
    await db
      .update(schema.guardians)
      .set({ userId: parentUser })
      .where(inArray(schema.guardians.email, ["attendance-ravi@example.com"]));
    await db
      .update(schema.guardians)
      .set({ userId: otherParent })
      .where(inArray(schema.guardians.email, ["attendance-other@example.com"]));
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    await db.delete(schema.notifications).where(inArray(schema.notifications.schoolId, ids));
    await db
      .delete(schema.attendanceRecords)
      .where(inArray(schema.attendanceRecords.schoolId, ids));
    await db.delete(schema.attendanceDays).where(inArray(schema.attendanceDays.schoolId, ids));
    await db.delete(schema.staffAttendance).where(inArray(schema.staffAttendance.schoolId, ids));
    await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.schoolId, ids));
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
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  it("the class teacher marks today, and the parent of an absent child is alerted once", async () => {
    const api = createCaller(as(classTeacher, schoolA));
    const sheet = await api.attendance.sheet({ sectionId: sectionA, date: today });
    expect(sheet).toMatchObject({
      access: "teacher",
      marked: false,
      holiday: null,
      sectionLabel: "Class 6 A",
    });
    expect(sheet.students.map((s) => s.fullName)).toEqual(["Asha Verma", "Ravi Kumar"]);
    const first = await api.attendance.save({
      sectionId: sectionA,
      date: today,
      entries: [
        { studentId: asha, status: "absent" },
        { studentId: ravi, status: "present" },
      ],
    });
    expect(first).toEqual({ saved: 2, absentNotified: 1 });
    // Saving the same marks again does not alert twice; changing to absent alerts the other parent.
    expect(
      await api.attendance.save({
        sectionId: sectionA,
        date: today,
        entries: [
          { studentId: asha, status: "absent" },
          { studentId: ravi, status: "absent" },
        ],
      }),
    ).toEqual({ saved: 2, absentNotified: 1 });
    const alertsForParent = await createCaller(as(parentUser, schoolA)).notifications.list();
    expect(alertsForParent.items).toHaveLength(1);
    expect(alertsForParent.items[0]).toMatchObject({
      kind: "attendance.absent",
      title: "Asha Verma was marked absent",
    });
    expect(
      (await createCaller(as(otherParent, schoolA)).notifications.list()).items.map((n) => n.title),
    ).toEqual(["Ravi Kumar was marked absent"]);
    const after = await api.attendance.sheet({ sectionId: sectionA, date: today });
    expect(after.marked).toBe(true);
    expect(after.students.map((s) => s.status)).toEqual(["absent", "absent"]);
  });

  it("other teachers, parents and students cannot mark; unknown students are refused", async () => {
    const entries = [{ studentId: asha, status: "present" as const }];
    expect(
      await code(
        createCaller(as(subjectTeacher, schoolA)).attendance.save({
          sectionId: sectionA,
          date: today,
          entries,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        createCaller(as(parentUser, schoolA)).attendance.save({
          sectionId: sectionA,
          date: today,
          entries,
        }),
      ),
    ).toBe("NOT_FOUND");
    // The admin is not the class teacher, so cannot mark today either.
    expect(
      await code(
        createCaller(as(admin, schoolA)).attendance.save({
          sectionId: sectionA,
          date: today,
          entries,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        createCaller(as(classTeacher, schoolA)).attendance.save({
          sectionId: sectionA,
          date: today,
          entries: [{ studentId: "00000000-0000-7000-8000-0000000000aa", status: "present" }],
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("closes the teacher's window after midnight; an admin corrects with a reason, audited", async () => {
    const teacher = createCaller(as(classTeacher, schoolA));
    const entries = [
      { studentId: asha, status: "present" as const },
      { studentId: ravi, status: "late" as const },
    ];
    expect(
      await code(teacher.attendance.save({ sectionId: sectionA, date: yesterday, entries })),
    ).toBe("FORBIDDEN");
    expect(
      await code(teacher.attendance.save({ sectionId: sectionA, date: dayOffset(1), entries })),
    ).toBe("FORBIDDEN");
    const api = createCaller(as(admin, schoolA));
    expect((await api.attendance.sheet({ sectionId: sectionA, date: yesterday })).access).toBe(
      "correction",
    );
    expect(await code(api.attendance.save({ sectionId: sectionA, date: yesterday, entries }))).toBe(
      "BAD_REQUEST",
    );
    expect(
      await code(
        api.attendance.save({ sectionId: sectionA, date: yesterday, entries, reason: "no" }),
      ),
    ).toBe("BAD_REQUEST");
    await api.attendance.save({
      sectionId: sectionA,
      date: yesterday,
      entries,
      reason: "Teacher forgot to submit",
    });
    const [event] = await db
      .select()
      .from(schema.auditEvents)
      .where(inArray(schema.auditEvents.action, ["attendance.corrected"]));
    expect(event?.metadata).toMatchObject({ date: yesterday, reason: "Teacher forgot to submit" });
  });

  it("holidays block marking for everyone", async () => {
    const api = createCaller(as(admin, schoolA));
    const day = dayOffset(-5);
    await api.calendar.save({
      startDate: day,
      endDate: day,
      title: "Founders Day",
      type: "holiday",
      audience: "all",
    });
    const sheet = await api.attendance.sheet({ sectionId: sectionA, date: day });
    expect(sheet).toMatchObject({ access: "view", holiday: "Founders Day" });
    expect(
      await code(
        api.attendance.save({
          sectionId: sectionA,
          date: day,
          entries: [{ studentId: asha, status: "present" }],
          reason: "Trying anyway",
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("shows a student's history to their parent but not to another family", async () => {
    const range = { studentId: asha, from: dayOffset(-30), to: today };
    const mine = await createCaller(as(parentUser, schoolA)).attendance.forStudent(range);
    expect(mine.counts).toEqual({ present: 1, absent: 1, leave: 0, late: 0 });
    expect(mine.percent).toBe(50);
    expect(await code(createCaller(as(otherParent, schoolA)).attendance.forStudent(range))).toBe(
      "NOT_FOUND",
    );
    expect(
      (await createCaller(as(classTeacher, schoolA)).attendance.forStudent(range)).records.length,
    ).toBe(2);
  });

  it("lists the sections each person can open", async () => {
    const mine = await createCaller(as(classTeacher, schoolA)).attendance.sections();
    expect(mine).toEqual([
      { sectionId: sectionA, label: "Class 6 A", isClassTeacher: true, markedToday: true },
    ]);
    expect((await createCaller(as(admin, schoolA)).attendance.sections())[0]?.isClassTeacher).toBe(
      false,
    );
  });

  it("the School Admin marks staff attendance; teachers cannot", async () => {
    const api = createCaller(as(admin, schoolA));
    const sheet = await api.attendance.staffSheet({ date: today });
    expect(sheet.canEdit).toBe(true);
    expect(sheet.staff.map((s) => s.fullName)).toContain("Office Clerk");
    await api.attendance.saveStaff({
      date: today,
      entries: [
        { staffId: teacherStaff, status: "present" },
        { staffId: clerk, status: "leave" },
      ],
    });
    const again = await api.attendance.staffSheet({ date: today });
    expect(again.staff.find((s) => s.id === clerk)?.status).toBe("leave");
    expect(
      await code(
        api.attendance.saveStaff({
          date: dayOffset(1),
          entries: [{ staffId: clerk, status: "present" }],
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        createCaller(as(classTeacher, schoolA)).attendance.saveStaff({
          date: today,
          entries: [{ staffId: clerk, status: "present" }],
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(createCaller(as(classTeacher, schoolA)).attendance.staffSheet({ date: today })),
    ).toBe("FORBIDDEN");
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await b.attendance.sections()).toEqual([]);
    await b.setup.createSession({
      name: "2026-27",
      startDate: "2000-04-01",
      endDate: "2099-03-31",
    });
    expect(await code(b.attendance.sheet({ sectionId: sectionA, date: today }))).toBe("NOT_FOUND");
    expect(await code(b.attendance.forStudent({ studentId: asha, from: today, to: today }))).toBe(
      "NOT_FOUND",
    );
  });
});
