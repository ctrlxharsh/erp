import { calendarImportColumns, MAX_CALENDAR_ROWS, type RawCalendarRow } from "@erp/domain";
import ExcelJS from "exceljs";
import { asText, ImportFileError } from "./student-import";

/** Reads the calendar sheet. Throws ImportFileError with a plain message when the file is unusable. */
export async function readCalendarSheet(bytes: Uint8Array): Promise<RawCalendarRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ImportFileError(
      "This file could not be read. Please upload the Excel template (.xlsx).",
    );
  }
  const sheet = workbook.getWorksheet("Calendar") ?? workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("The file has no sheets.");
  const columnOf = new Map<string, number>();
  sheet
    .getRow(1)
    .eachCell((cell, column) => columnOf.set(asText(cell.value).toLowerCase(), column));
  const missing = calendarImportColumns.filter((title) => !columnOf.has(title.toLowerCase()));
  if (missing.length > 0) {
    throw new ImportFileError(
      `The first row must have these column titles: ${missing.join(", ")}. Please use the template.`,
    );
  }
  const rows: RawCalendarRow[] = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number);
    const get = (title: (typeof calendarImportColumns)[number]) =>
      asText(row.getCell(columnOf.get(title.toLowerCase()) ?? 0).value);
    const raw: RawCalendarRow = {
      row: number,
      startDate: get("Start date"),
      endDate: get("End date"),
      title: get("Title"),
      type: get("Type"),
      audience: get("Audience"),
    };
    if (Object.entries(raw).every(([key, value]) => key === "row" || value === "")) continue;
    rows.push(raw);
    if (rows.length > MAX_CALENDAR_ROWS) {
      throw new ImportFileError(
        `The sheet has more than ${MAX_CALENDAR_ROWS} rows. Please upload it in smaller parts.`,
      );
    }
  }
  if (rows.length === 0)
    throw new ImportFileError("The sheet has no events. Fill in the rows below the column titles.");
  return rows;
}

export async function buildCalendarTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Calendar");
  sheet.addRow([...calendarImportColumns]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [{ width: 16 }, { width: 16 }, { width: 40 }, { width: 14 }, { width: 24 }];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const col of [1, 2]) sheet.getColumn(col).numFmt = "@";
  const help = workbook.addWorksheet("How to fill");
  for (const line of [
    "One event per row on the Calendar sheet. Do not change the column titles.",
    "Start date and Title are required. Dates are day first, for example 15/08/2026.",
    "End date: leave empty for a one-day event.",
    "Type: Holiday, Event, Exam, PTM or Other. Holidays block attendance on those days.",
    "Audience: All, Teachers, or Students and parents. Empty means All.",
  ]) {
    help.addRow([line]);
  }
  help.getColumn(1).width = 100;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
