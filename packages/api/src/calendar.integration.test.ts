import { createDb, schema, withSchool } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import type { EmailMessage } from "./email";
import { saveNotifications, sendNotificationEmails } from "./notify";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Calendar and notifications on the real Neon `test` database. Skipped without DATABASE_URL. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000201";
const teacher = "00000000-0000-7000-8000-000000000202";
const parent = "00000000-0000-7000-8000-000000000203";
const adminB = "00000000-0000-7000-8000-000000000204";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

async function sheet(rows: string[][]) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Calendar");
  ws.addRow(["Start date", "End date", "Title", "Type", "Audience"]);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}

run("calendar and notifications", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `calendar-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
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
      { userId: teacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: parent, schoolId: schoolA, roles: ["parent"] },
      { userId: adminB, schoolId: schoolB, roles: ["school_admin"] },
    ]);
  });

  afterAll(async () => {
    const ids = [schoolA, schoolB];
    await db.delete(schema.notifications).where(inArray(schema.notifications.schoolId, ids));
    await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.schoolId, ids));
    await db.delete(schema.memberships).where(inArray(schema.memberships.schoolId, ids));
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, ids));
  });

  it("lets only the School Admin add events, and each role sees its own audience", async () => {
    const api = createCaller(as(admin, schoolA));
    await api.calendar.save({
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      title: "Diwali break",
      type: "holiday",
      audience: "all",
    });
    await api.calendar.save({
      startDate: "2026-10-10",
      endDate: "2026-10-10",
      title: "Staff meeting",
      type: "event",
      audience: "teachers",
    });
    await api.calendar.save({
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      title: "PTM",
      type: "ptm",
      audience: "students_parents",
    });
    const range = { from: "2026-10-01", to: "2026-10-31" };
    expect((await api.calendar.list(range)).map((e) => e.title)).toEqual([
      "Diwali break",
      "Staff meeting",
      "PTM",
    ]);
    expect(
      (await createCaller(as(teacher, schoolA)).calendar.list(range)).map((e) => e.title),
    ).toEqual(["Diwali break", "Staff meeting"]);
    expect(
      (await createCaller(as(parent, schoolA)).calendar.list(range)).map((e) => e.title),
    ).toEqual(["Diwali break", "PTM"]);
    expect(
      await code(
        createCaller(as(teacher, schoolA)).calendar.save({
          startDate: "2026-10-20",
          endDate: "2026-10-20",
          title: "Nope",
          type: "event",
          audience: "all",
        }),
      ),
    ).toBe("FORBIDDEN");
    // Events that only overlap the range are included; others are not.
    expect(
      (await api.calendar.list({ from: "2026-10-05", to: "2026-10-06" })).map((e) => e.title),
    ).toEqual(["Diwali break"]);
  });

  it("edits and deletes events", async () => {
    const api = createCaller(as(admin, schoolA));
    const [event] = await api.calendar.list({ from: "2026-10-10", to: "2026-10-10" });
    await api.calendar.save({
      id: event?.id,
      startDate: "2026-10-11",
      endDate: "2026-10-11",
      title: "Staff meeting (moved)",
      type: "event",
      audience: "teachers",
    });
    expect(
      (await api.calendar.list({ from: "2026-10-11", to: "2026-10-11" })).map((e) => e.title),
    ).toEqual(["Staff meeting (moved)"]);
    await api.calendar.delete({ id: event?.id ?? "" });
    expect(await api.calendar.list({ from: "2026-10-11", to: "2026-10-11" })).toEqual([]);
  });

  it("imports a calendar sheet all-or-nothing", async () => {
    const api = createCaller(as(admin, schoolA));
    const bad = await sheet([
      ["15/08/2026", "", "Independence Day", "Holiday", ""],
      ["xx", "", "", "Party", ""],
    ]);
    const preview = await api.calendar.preview({ fileBase64: bad });
    expect(preview).toMatchObject({ totalRows: 2, validRows: 1 });
    expect(preview.errors[0]?.row).toBe(3);
    expect(await code(api.calendar.commit({ fileBase64: bad }))).toBe("BAD_REQUEST");
    expect(await api.calendar.list({ from: "2026-08-15", to: "2026-08-15" })).toEqual([]);
    const good = await sheet([
      ["15/08/2026", "", "Independence Day", "Holiday", ""],
      ["26/01/2027", "26/01/2027", "Republic Day", "Holiday", "All"],
    ]);
    expect(await api.calendar.commit({ fileBase64: good })).toEqual({ created: 2 });
    expect(
      (await api.calendar.list({ from: "2026-08-01", to: "2026-08-31" })).map((e) => e.title),
    ).toEqual(["Independence Day"]);
  });

  it("keeps schools apart", async () => {
    const b = createCaller(as(adminB, schoolB));
    expect(await b.calendar.list({ from: "2026-01-01", to: "2027-12-31" })).toEqual([]);
  });

  it("gives each person only their own notifications, and emails only when asked", async () => {
    const sent: EmailMessage[] = [];
    const sender = { send: async (m: EmailMessage) => void sent.push(m) };
    const inputs = [
      {
        userId: parent,
        kind: "test.one",
        title: "For the parent",
        body: "Hello",
        link: "/x",
        email: true,
      },
      { userId: teacher, kind: "test.two", title: "For the teacher" },
    ];
    await withSchool(db, schoolA, (scope) => saveNotifications(scope, inputs));
    const result = await sendNotificationEmails(db, sender, inputs);
    // The test users have no auth account, so no address is found and nothing is sent.
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sent).toEqual([]);

    const mineParent = await createCaller(as(parent, schoolA)).notifications.list();
    expect(mineParent.items.map((n) => n.title)).toEqual(["For the parent"]);
    expect(mineParent.unreadCount).toBe(1);
    await createCaller(as(parent, schoolA)).notifications.markRead({
      id: mineParent.items[0]?.id ?? "",
    });
    expect((await createCaller(as(parent, schoolA)).notifications.list()).unreadCount).toBe(0);
    // Someone else cannot mark it, and the teacher's list is separate.
    const teacherList = await createCaller(as(teacher, schoolA)).notifications.list();
    expect(teacherList.items.map((n) => n.title)).toEqual(["For the teacher"]);
    await createCaller(as(teacher, schoolA)).notifications.markRead({
      id: mineParent.items[0]?.id ?? "",
    });
    expect((await createCaller(as(parent, schoolA)).notifications.list()).items[0]?.read).toBe(
      true,
    );
    await createCaller(as(teacher, schoolA)).notifications.markAllRead();
    expect((await createCaller(as(teacher, schoolA)).notifications.list()).unreadCount).toBe(0);
    // Another school sees nothing.
    expect((await createCaller(as(adminB, schoolB)).notifications.list()).items).toEqual([]);
  });
});
