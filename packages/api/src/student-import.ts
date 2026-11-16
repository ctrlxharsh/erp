import { classKey, MAX_IMPORT_ROWS, type RawStudentRow, studentImportColumns } from "@erp/domain";
import ExcelJS from "exceljs";

export const asText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return asText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value) return String((value as { text?: string }).text ?? value.hyperlink);
    return "";
  }
  return String(value).trim();
};

export class ImportFileError extends Error {}

/** Reads the student sheet. Throws ImportFileError with a plain message when the file is unusable. */
export async function readStudentSheet(bytes: Uint8Array): Promise<RawStudentRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ImportFileError(
      "This file could not be read. Please upload the Excel template (.xlsx).",
    );
  }
  const sheet = workbook.getWorksheet("Students") ?? workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("The file has no sheets.");

  const header = sheet.getRow(1);
  const columnOf = new Map<string, number>();
  header.eachCell((cell, column) => columnOf.set(asText(cell.value).toLowerCase(), column));
  const missing = studentImportColumns.filter((title) => !columnOf.has(title.toLowerCase()));
  if (missing.length > 0) {
    throw new ImportFileError(
      `The first row must have these column titles: ${missing.join(", ")}. Please use the template.`,
    );
  }
  const col = (title: (typeof studentImportColumns)[number]) =>
    columnOf.get(title.toLowerCase()) ?? 0;

  const rows: RawStudentRow[] = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number);
    const get = (title: (typeof studentImportColumns)[number]) =>
      asText(row.getCell(col(title)).value);
    const raw: RawStudentRow = {
      row: number,
      admissionNo: get("Admission no"),
      fullName: get("Full name"),
      dateOfBirth: get("Date of birth"),
      gender: get("Gender"),
      className: get("Class"),
      sectionName: get("Section"),
      guardianName: get("Guardian name"),
      guardianEmail: get("Guardian email"),
      guardianPhone: get("Guardian phone"),
    };
    if (Object.entries(raw).every(([key, value]) => key === "row" || value === "")) continue;
    rows.push(raw);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ImportFileError(
        `The sheet has more than ${MAX_IMPORT_ROWS} students. Please upload it in smaller parts.`,
      );
    }
  }
  if (rows.length === 0)
    throw new ImportFileError(
      "The sheet has no students. Fill in the rows below the column titles.",
    );
  return rows;
}

/** The blank template: a Students sheet to fill in, and a Classes sheet listing what already exists. */
export async function buildStudentTemplate(
  sections: { className: string; sectionName: string }[],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const students = workbook.addWorksheet("Students");
  students.addRow([...studentImportColumns]);
  students.getRow(1).font = { bold: true };
  students.columns = studentImportColumns.map((title) => ({
    width: Math.max(16, title.length + 4),
  }));
  students.views = [{ state: "frozen", ySplit: 1 }];
  // Dates and phone numbers are text so Excel does not reformat them.
  for (const title of ["Admission no", "Date of birth", "Guardian phone"] as const) {
    students.getColumn(studentImportColumns.indexOf(title) + 1).numFmt = "@";
  }

  const help = workbook.addWorksheet("How to fill");
  for (const line of [
    "Fill one student per row on the Students sheet. Do not change the column titles.",
    "Admission no, Full name, Class and Section are required. Everything else is optional.",
    "Date of birth: day first, for example 05/08/2014.",
    "Gender: Female, Male or Other.",
    "Class and Section must match the Classes sheet exactly (create them in School setup first).",
    "Guardian email: two students with the same guardian email are linked to the same parent.",
    "Guardian phone: a 10-digit Indian mobile number.",
    `Up to ${MAX_IMPORT_ROWS} students per file.`,
  ]) {
    help.addRow([line]);
  }
  help.getColumn(1).width = 100;

  const classes = workbook.addWorksheet("Classes");
  classes.addRow(["Class", "Section"]);
  classes.getRow(1).font = { bold: true };
  for (const s of sections) classes.addRow([s.className, s.sectionName]);
  classes.columns = [{ width: 24 }, { width: 14 }];

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export { classKey };
