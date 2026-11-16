/** Grading, results workflow and leave rules for Phase 3. Pure, so they are easy to test. */

export interface GradeBand {
  grade: string;
  /** Lowest percentage that earns this grade. */
  minPercent: number;
  gradePoint: number;
}

/** CBSE 9-point scale, the default for new schools (ADR-002, ADR-018). */
export const defaultGradeBands: readonly GradeBand[] = [
  { grade: "A1", minPercent: 91, gradePoint: 10 },
  { grade: "A2", minPercent: 81, gradePoint: 9 },
  { grade: "B1", minPercent: 71, gradePoint: 8 },
  { grade: "B2", minPercent: 61, gradePoint: 7 },
  { grade: "C1", minPercent: 51, gradePoint: 6 },
  { grade: "C2", minPercent: 41, gradePoint: 5 },
  { grade: "D", minPercent: 33, gradePoint: 4 },
  { grade: "E1", minPercent: 21, gradePoint: 0 },
  { grade: "E2", minPercent: 0, gradePoint: 0 },
];

/** Problems with a grade scale, in plain words. An empty list means it can be saved. */
export function validateGradeBands(bands: readonly GradeBand[]): string[] {
  const problems: string[] = [];
  if (bands.length < 2) problems.push("Add at least two grades.");
  if (!bands.some((b) => b.minPercent === 0))
    problems.push("One grade must start at 0%, so every mark has a grade.");
  const names = new Set<string>();
  const starts = new Set<number>();
  for (const band of bands) {
    if (!band.grade.trim()) problems.push("Every grade needs a name.");
    if (names.has(band.grade.trim().toLowerCase()))
      problems.push(`The grade ${band.grade} is listed twice.`);
    if (starts.has(band.minPercent)) problems.push(`Two grades start at ${band.minPercent}%.`);
    if (band.minPercent < 0 || band.minPercent > 100)
      problems.push("Percentages must be between 0 and 100.");
    names.add(band.grade.trim().toLowerCase());
    starts.add(band.minPercent);
  }
  return [...new Set(problems)];
}

/** Percentage to one decimal place, or null when there is no maximum. */
export function percentage(marks: number, max: number): number | null {
  if (max <= 0) return null;
  return Math.round((marks / max) * 1000) / 10;
}

/** The grade for a percentage: the band with the highest start that the percentage reaches. */
export function gradeFor(percent: number, bands: readonly GradeBand[]): GradeBand | null {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((band) => percent >= band.minPercent) ?? null;
}

export interface SubjectResult {
  subject: string;
  /** Null when the student was absent. */
  marks: number | null;
  max: number;
}

export interface ReportSummary {
  totalMarks: number;
  totalMax: number;
  percent: number | null;
  grade: string | null;
  gradePoint: number | null;
}

/** Totals over the subjects that have a result. Absent counts as zero marks out of the maximum. */
export function summarise(
  results: readonly SubjectResult[],
  bands: readonly GradeBand[],
): ReportSummary {
  const totalMax = results.reduce((sum, r) => sum + r.max, 0);
  const totalMarks = results.reduce((sum, r) => sum + (r.marks ?? 0), 0);
  const percent = percentage(totalMarks, totalMax);
  const band = percent === null ? null : gradeFor(percent, bands);
  return {
    totalMarks,
    totalMax,
    percent,
    grade: band?.grade ?? null,
    gradePoint: band?.gradePoint ?? null,
  };
}

// ---- Result batches (exam + section + subject), ADR-018 ------------------------------------

export const resultStatuses = ["draft", "submitted", "approved", "rejected", "published"] as const;
export type ResultStatus = (typeof resultStatuses)[number];
export type ResultAction = "edit" | "submit" | "approve" | "reject" | "publish";

/** Draft → Submitted → Approved / Rejected → Published. Marks can change only in Draft and Rejected. */
export function nextResultStatus(from: ResultStatus, action: ResultAction): ResultStatus | null {
  switch (action) {
    case "edit":
      return from === "draft" || from === "rejected" ? from : null;
    case "submit":
      return from === "draft" || from === "rejected" ? "submitted" : null;
    case "approve":
      return from === "submitted" ? "approved" : null;
    case "reject":
      return from === "submitted" ? "rejected" : null;
    case "publish":
      return from === "approved" ? "published" : null;
  }
}

// ---- Leave ---------------------------------------------------------------------------------

export const leaveStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof leaveStatuses)[number];

/** Pending → Approved / Rejected / Cancelled. Nothing else changes. */
export function nextLeaveStatus(
  from: LeaveStatus,
  action: "approve" | "reject" | "cancel",
): LeaveStatus | null {
  if (from !== "pending") return null;
  return action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
}

/** Every date from `from` to `to` inclusive (ISO), skipping Sundays, which are not school days. */
export function leaveWorkingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && days.length < 366) {
    if (cursor.getUTCDay() !== 0) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
