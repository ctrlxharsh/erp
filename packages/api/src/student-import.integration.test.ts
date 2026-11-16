import { createDb, schema } from "@erp/db";
import { MAX_IMPORT_ROWS, studentImportColumns } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/** Student Excel import on the real Neon `test` database, including a 500-student file. */
const run = process.env.DATABASE_URL ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-000000000101";
const teacher = "00000000-0000-7000-8000-000000000102";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

async function sheet(
  rows: (string | number)[][],
  titles: readonly string[] = studentImportColumns,
) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Students");
  ws.addRow([...titles]);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}

run("student import", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const tag = `import-test-${Date.now()}`;
  let schoolId = "";
  const as = (userId: string): Context => ({
    db,
    storage: null as never,
    authAdmin: null as never,
    email: null as never,
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId: schoolId,
  });

  beforeAll(async () => {
    const [school] = await db
      .insert(schema.schools)
      .values({ name: tag })
      .returning({ id: schema.schools.id });
    schoolId = school?.id ?? "";
    await db.insert(schema.memberships).values([
      { userId: admin, schoolId, roles: ["school_admin"] },
      { userId: teacher, schoolId, roles: ["teacher"] },
    ]);
    const api = createCaller(as(admin));
    await api.setup.createSession({
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    });
    await api.setup.createClass({ name: "Class 6" });
    const classId = (await api.setup.get()).classes[0]?.id ?? "";
    await api.setup.createSection({ classId, name: "A" });
    await api.setup.createSection({ classId, name: "B" });
  });

  afterAll(async () => {
    await db
      .delete(schema.studentGuardians)
      .where(inArray(schema.studentGuardians.schoolId, [schoolId]));
    await db
      .delete(schema.studentEnrolments)
      .where(inArray(schema.studentEnrolments.schoolId, [schoolId]));
    for (const table of [
      schema.students,
      schema.guardians,
      schema.sections,
      schema.classes,
      schema.academicSessions,
      schema.memberships,
    ] as const) {
      await db.delete(table).where(inArray(table.schoolId, [schoolId]));
    }
    await db
      .update(schema.schools)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(inArray(schema.schools.id, [schoolId]));
  });

  it("gives a template that lists the school's classes and sections", async () => {
    const template = await createCaller(as(admin)).people.studentImport.template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(template.fileBase64, "base64") as never);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Students", "How to fill", "Classes"]);
    expect(workbook.getWorksheet("Classes")?.getRow(2).values).toEqual([undefined, "Class 6", "A"]);
  });

  it("reports every problem per row and saves nothing", async () => {
    const api = createCaller(as(admin));
    const file = await sheet([
      [
        "E-1",
        "Good Student",
        "05/08/2014",
        "Female",
        "Class 6",
        "A",
        "Parent One",
        "p1@example.com",
        "9876543210",
      ],
      ["", "No Number", "31/02/2014", "?", "Class 9", "A", "", "bad-email", ""],
      ["E-1", "Repeated", "", "", "Class 6", "B", "", "", ""],
    ]);
    const preview = await api.people.studentImport.preview({ fileBase64: file });
    expect(preview).toMatchObject({ totalRows: 3, validRows: 1 });
    expect(preview.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(preview.errors[0]?.messages.length).toBeGreaterThanOrEqual(4);
    expect(
      await code(api.people.studentImport.commit({ fileBase64: file, consentConfirmed: true })),
    ).toBe("BAD_REQUEST");
    expect(
      (
        await api.people.students.list({
          page: 1,
          pageSize: 5,
          search: "",
          sort: "name",
          direction: "asc",
        })
      ).total,
    ).toBe(0);
  });

  it("rejects files that are not the template", async () => {
    const api = createCaller(as(admin));
    expect(
      await code(
        api.people.studentImport.preview({
          fileBase64: Buffer.from("not excel").toString("base64"),
        }),
      ),
    ).toBe("BAD_REQUEST");
    const wrong = await sheet([["x"]], ["Name only"]);
    expect(await code(api.people.studentImport.preview({ fileBase64: wrong }))).toBe("BAD_REQUEST");
    const tooMany = await sheet(
      Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [
        `T-${i}`,
        "N",
        "",
        "",
        "Class 6",
        "A",
        "",
        "",
        "",
      ]),
    );
    expect(await code(api.people.studentImport.preview({ fileBase64: tooMany }))).toBe(
      "BAD_REQUEST",
    );
  });

  it("imports 500 students with shared parents in one go", async () => {
    const api = createCaller(as(admin));
    const rows = Array.from({ length: 500 }, (_, i) => {
      const family = Math.floor(i / 2); // siblings share a parent email
      return [
        `S-${String(i + 1).padStart(4, "0")}`,
        `Student ${i + 1}`,
        "05/08/2014",
        i % 2 ? "Male" : "Female",
        "Class 6",
        i % 3 ? "A" : "B",
        `Parent ${family}`,
        `family${family}@example.com`,
        "9876543210",
      ];
    });
    const file = await sheet(rows);
    const preview = await api.people.studentImport.preview({ fileBase64: file });
    expect(preview).toMatchObject({ totalRows: 500, validRows: 500, errors: [] });

    expect(
      await code(
        createCaller(as(teacher)).people.studentImport.commit({
          fileBase64: file,
          consentConfirmed: true,
        }),
      ),
    ).toBe("FORBIDDEN");
    const started = Date.now();
    const result = await api.people.studentImport.commit({
      fileBase64: file,
      consentConfirmed: true,
    });
    const seconds = (Date.now() - started) / 1000;
    expect(result).toEqual({ created: 500, guardiansCreated: 250 });
    expect(seconds).toBeLessThan(25);

    const list = await api.people.students.list({
      page: 1,
      pageSize: 50,
      search: "",
      sort: "admissionNo",
      direction: "asc",
    });
    expect(list.total).toBe(500);
    const first = await api.people.students.get({ id: list.items[0]?.id ?? "" });
    expect(first.guardians).toHaveLength(1);
    // Importing the same file again is refused: every admission number now exists.
    expect(
      await code(api.people.studentImport.commit({ fileBase64: file, consentConfirmed: true })),
    ).toBe("BAD_REQUEST");
    expect(
      (
        await api.people.students.list({
          page: 1,
          pageSize: 1,
          search: "",
          sort: "name",
          direction: "asc",
        })
      ).total,
    ).toBe(500);
  });
});
