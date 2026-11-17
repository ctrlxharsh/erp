import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Teacher and staff leave on the real Neon `test` database. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000801";
const principal = "00000000-0000-7000-8000-000000000802";
const teacher = "00000000-0000-7000-8000-000000000803";
const otherTeacher = "00000000-0000-7000-8000-000000000804";
const adminB = "00000000-0000-7000-8000-000000000805";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("leave", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `leave-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  let teacherStaff = "";
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
      { userId: otherTeacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
    const api = createCaller(as(admin, schoolA));
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
    await db
      .update(schema.staff)
      .set({ userId: teacher })
      .where(inArray(schema.staff.id, [teacherStaff]));
    await db
      .update(schema.staff)
      .set({ userId: otherTeacher })
      .where(inArray(schema.staff.id, [other]));
    // A holiday inside the leave window: it must stay a holiday, not become Leave.
    await api.calendar.save({
      startDate: "2027-03-03",
      endDate: "2027-03-03",
      title: "Holi",
      type: "holiday",
      audience: "all",
    });
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    for (const table of [
      schema.notifications,
      schema.leaveRequestFiles,
      schema.leaveRequests,
      schema.leaveTypes,
      schema.staffAttendance,
      schema.calendarEvents,
      schema.staff,
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, ids));
    }
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  const request = (types: { id: string; name: string }[], over: Record<string, unknown> = {}) => ({
    leaveTypeId: types.find((t) => t.name === "Casual Leave")?.id ?? "",
    fromDate: "2027-03-01",
    toDate: "2027-03-07",
    reason: "Family function",
    fileIds: [] as string[],
    ...over,
  });

  it("seeds leave types, and a teacher applies; the Principal is told and overlaps are refused", async () => {
    const api = createCaller(as(teacher, schoolA));
    const types = await api.leave.types();
    expect(types.map((t) => t.name)).toEqual([
      "Casual Leave",
      "Earned Leave",
      "Other",
      "Sick Leave",
    ]);
    expect(
      await code(
        api.leave.submit(request(types, { fromDate: "2020-01-01", toDate: "2020-01-02" })),
      ),
    ).toBe("BAD_REQUEST");
    expect(await code(api.leave.submit(request(types, { toDate: "2027-02-01" })))).toBe(
      "BAD_REQUEST",
    );
    await api.leave.submit(request(types));
    expect(
      await code(
        api.leave.submit(request(types, { fromDate: "2027-03-05", toDate: "2027-03-09" })),
      ),
    ).toBe("CONFLICT");
    const mine = await api.leave.mine();
    expect(mine).toEqual([
      expect.objectContaining({
        applicantName: "Meera Nair",
        leaveTypeName: "Casual Leave",
        status: "pending",
      }),
    ]);
    expect(
      (await createCaller(as(principal, schoolA)).notifications.list()).items.map((n) => n.title),
    ).toContain("Meera Nair applied for leave");
  });

  it("someone without a staff record cannot apply", async () => {
    expect(
      await code(
        createCaller(as(admin, schoolA)).leave.submit(
          request(await createCaller(as(admin, schoolA)).leave.types()),
        ),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("only the Principal decides; approval fills staff attendance with Leave on working days, not holidays", async () => {
    const principalApi = createCaller(as(principal, schoolA));
    const [pending] = await principalApi.leave.review({});
    expect(pending).toMatchObject({ applicantName: "Meera Nair", status: "pending" });
    const id = pending?.id ?? "";
    expect(await code(createCaller(as(admin, schoolA)).leave.approve({ id }))).toBe("FORBIDDEN");
    expect(await code(createCaller(as(teacher, schoolA)).leave.approve({ id }))).toBe("FORBIDDEN");
    expect(await code(principalApi.leave.reject({ id, comment: "" }))).toBe("BAD_REQUEST");
    await principalApi.leave.approve({ id });
    expect(await code(principalApi.leave.approve({ id }))).toBe("PRECONDITION_FAILED");

    const adminApi = createCaller(as(admin, schoolA));
    const statusOn = async (date: string) =>
      (await adminApi.attendance.staffSheet({ date })).staff.find((s) => s.id === teacherStaff)
        ?.status ?? null;
    expect(await statusOn("2027-03-01")).toBe("leave");
    expect(await statusOn("2027-03-06")).toBe("leave");
    expect(await statusOn("2027-03-07")).toBeNull(); // Sunday
    expect(await statusOn("2027-03-03")).toBeNull(); // holiday
    expect(
      (await createCaller(as(teacher, schoolA)).notifications.list()).items.map((n) => n.title),
    ).toContain("Your leave was approved");
    expect((await createCaller(as(teacher, schoolA)).leave.mine())[0]?.status).toBe("approved");
  });

  it("rejection tells the applicant why; only waiting requests can be cancelled", async () => {
    const api = createCaller(as(otherTeacher, schoolA));
    const types = await api.leave.types();
    const { id } = await api.leave.submit(
      request(types, { fromDate: "2027-04-05", toDate: "2027-04-06", reason: "Medical checkup" }),
    );
    const principalApi = createCaller(as(principal, schoolA));
    await principalApi.leave.reject({ id, comment: "Exams that week" });
    expect((await api.leave.mine())[0]).toMatchObject({
      status: "rejected",
      decisionComment: "Exams that week",
    });
    expect((await api.notifications.list()).items.map((n) => n.title)).toContain(
      "Your leave was not approved",
    );
    expect(await code(api.leave.cancel({ id }))).toBe("PRECONDITION_FAILED");
    const second = await api.leave.submit(
      request(types, { fromDate: "2027-04-12", toDate: "2027-04-12", reason: "Personal work" }),
    );
    // Someone else cannot cancel it; the owner can.
    expect(await code(createCaller(as(teacher, schoolA)).leave.cancel({ id: second.id }))).toBe(
      "NOT_FOUND",
    );
    await api.leave.cancel({ id: second.id });
    expect((await api.leave.mine()).find((r) => r.id === second.id)?.status).toBe("cancelled");
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await code(b.leave.review({}))).toBe("FORBIDDEN");
    expect(await code(b.leave.mine())).toBe("OK");
  });
});
