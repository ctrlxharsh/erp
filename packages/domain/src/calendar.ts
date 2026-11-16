import { parseDate } from "./people";

export const calendarEventTypes = ["holiday", "event", "exam", "ptm", "other"] as const;
export type CalendarEventType = (typeof calendarEventTypes)[number];
export const calendarAudiences = ["all", "teachers", "students_parents"] as const;
export type CalendarAudience = (typeof calendarAudiences)[number];

/** Columns of the calendar import sheet, in order. */
export const calendarImportColumns = [
  "Start date",
  "End date",
  "Title",
  "Type",
  "Audience",
] as const;
export const MAX_CALENDAR_ROWS = 500;

const typeAliases: Record<string, CalendarEventType> = {
  holiday: "holiday",
  event: "event",
  exam: "exam",
  ptm: "ptm",
  "parent teacher meeting": "ptm",
  other: "other",
};
const audienceAliases: Record<string, CalendarAudience> = {
  all: "all",
  everyone: "all",
  teachers: "teachers",
  staff: "teachers",
  "students and parents": "students_parents",
  students: "students_parents",
  parents: "students_parents",
};

export interface RawCalendarRow {
  row: number;
  startDate: string;
  endDate: string;
  title: string;
  type: string;
  audience: string;
}
export interface ValidCalendarRow {
  row: number;
  startDate: string;
  endDate: string;
  title: string;
  type: CalendarEventType;
  audience: CalendarAudience;
}

/** Validates the calendar sheet and reports every problem at once. End date may be empty (one day). */
export function validateCalendarImport(rows: readonly RawCalendarRow[]) {
  const valid: ValidCalendarRow[] = [];
  const errors: { row: number; messages: string[] }[] = [];
  for (const raw of rows) {
    const messages: string[] = [];
    const start = parseDate(raw.startDate);
    if (!start) messages.push("Start date is not a valid date (use dd/mm/yyyy)");
    const end = raw.endDate.trim() ? parseDate(raw.endDate) : start;
    if (raw.endDate.trim() && !end) messages.push("End date is not a valid date (use dd/mm/yyyy)");
    if (start && end && end < start) messages.push("End date is before the start date");
    const title = raw.title.trim().replace(/\s+/g, " ");
    if (!title) messages.push("Title is missing");
    else if (title.length > 120) messages.push("Title is too long (120 characters at most)");
    const type = typeAliases[raw.type.trim().toLowerCase()];
    if (!type) messages.push("Type must be Holiday, Event, Exam, PTM or Other");
    const audience = raw.audience.trim()
      ? audienceAliases[raw.audience.trim().toLowerCase()]
      : "all";
    if (!audience) messages.push("Audience must be All, Teachers or Students and parents");
    if (messages.length || !start || !end || !type || !audience)
      errors.push({ row: raw.row, messages });
    else valid.push({ row: raw.row, startDate: start, endDate: end, title, type, audience });
  }
  return { valid, errors };
}

/** True when `date` (ISO) falls on a holiday in the given events. Holidays block attendance. */
export function isHoliday(
  date: string,
  events: readonly { startDate: string; endDate: string; type: string }[],
): boolean {
  return events.some((e) => e.type === "holiday" && e.startDate <= date && date <= e.endDate);
}
