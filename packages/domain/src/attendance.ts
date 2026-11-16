/** Attendance rules (ADR-017). Dates are school-local days in Asia/Kolkata unless a zone is given. */

export const attendanceStatuses = ["present", "absent", "leave", "late"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const SCHOOL_TIMEZONE = "Asia/Kolkata";

/** Today's date (YYYY-MM-DD) as written on the wall in the school's time zone. */
export function schoolToday(now: Date = new Date(), timeZone: string = SCHOOL_TIMEZONE): string {
  // The "en-CA" locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type AttendanceAccess =
  /** The class teacher may mark or change today's attendance until midnight. */
  | { kind: "teacher" }
  /** After the window, only an admin may change it, and must give a reason. */
  | { kind: "correction" }
  | { kind: "denied"; reason: "future" | "window_closed" | "not_class_teacher" | "holiday" };

/**
 * Who may write attendance for `date`:
 *  - nobody for a future date or a holiday;
 *  - the class teacher on the same school day (until midnight);
 *  - an admin with the correction permission on any earlier day, with a reason.
 */
export function attendanceAccess(input: {
  date: string;
  today: string;
  isHoliday: boolean;
  isClassTeacher: boolean;
  canCorrect: boolean;
}): AttendanceAccess {
  if (input.date > input.today) return { kind: "denied", reason: "future" };
  if (input.isHoliday) return { kind: "denied", reason: "holiday" };
  if (input.date === input.today) {
    if (input.isClassTeacher) return { kind: "teacher" };
    return { kind: "denied", reason: "not_class_teacher" };
  }
  if (input.canCorrect) return { kind: "correction" };
  return { kind: "denied", reason: input.isClassTeacher ? "window_closed" : "not_class_teacher" };
}

/** Attendance percentage over days that were marked. Late counts as present; leave counts as absent. */
export function attendancePercent(counts: Record<AttendanceStatus, number>): number | null {
  const total = counts.present + counts.late + counts.absent + counts.leave;
  if (total === 0) return null;
  return Math.round(((counts.present + counts.late) / total) * 1000) / 10;
}
