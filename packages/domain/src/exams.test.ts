import { describe, expect, it } from "vitest";
import {
  defaultGradeBands,
  gradeFor,
  leaveWorkingDays,
  nextLeaveStatus,
  nextResultStatus,
  percentage,
  summarise,
  validateGradeBands,
} from "./exams";

describe("grades", () => {
  it("follows the CBSE 9-point scale at the boundaries", () => {
    const grade = (p: number) => gradeFor(p, defaultGradeBands)?.grade;
    expect(grade(100)).toBe("A1");
    expect(grade(91)).toBe("A1");
    expect(grade(90.9)).toBe("A2");
    expect(grade(33)).toBe("D");
    expect(grade(32.9)).toBe("E1");
    expect(grade(0)).toBe("E2");
  });

  it("works with bands given in any order", () => {
    const bands = [...defaultGradeBands].reverse();
    expect(gradeFor(75, bands)?.grade).toBe("B1");
  });

  it("computes percentages to one decimal and guards a zero maximum", () => {
    expect(percentage(37, 40)).toBe(92.5);
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(5, 0)).toBeNull();
  });

  it("validates a grade scale", () => {
    expect(validateGradeBands(defaultGradeBands)).toEqual([]);
    expect(
      validateGradeBands([
        { grade: "A", minPercent: 50, gradePoint: 1 },
        { grade: "B", minPercent: 40, gradePoint: 0 },
      ]),
    ).toContain("One grade must start at 0%, so every mark has a grade.");
    expect(
      validateGradeBands([
        { grade: "A", minPercent: 0, gradePoint: 1 },
        { grade: "a", minPercent: 50, gradePoint: 2 },
      ]).join(" "),
    ).toContain("listed twice");
    expect(
      validateGradeBands([
        { grade: "A", minPercent: 0, gradePoint: 1 },
        { grade: "B", minPercent: 0, gradePoint: 2 },
      ]).join(" "),
    ).toContain("start at 0%");
    expect(validateGradeBands([{ grade: "A", minPercent: 0, gradePoint: 1 }])).toContain(
      "Add at least two grades.",
    );
  });
});

describe("summarise", () => {
  it("totals marks and grades the overall percentage; absent counts as zero", () => {
    const result = summarise(
      [
        { subject: "Maths", marks: 80, max: 100 },
        { subject: "English", marks: null, max: 100 },
        { subject: "Science", marks: 90, max: 100 },
      ],
      defaultGradeBands,
    );
    expect(result).toEqual({
      totalMarks: 170,
      totalMax: 300,
      percent: 56.7,
      grade: "C1",
      gradePoint: 6,
    });
  });

  it("returns no grade when there are no subjects", () => {
    expect(summarise([], defaultGradeBands)).toEqual({
      totalMarks: 0,
      totalMax: 0,
      percent: null,
      grade: null,
      gradePoint: null,
    });
  });
});

describe("result batch workflow", () => {
  it("moves draft → submitted → approved → published", () => {
    expect(nextResultStatus("draft", "submit")).toBe("submitted");
    expect(nextResultStatus("submitted", "approve")).toBe("approved");
    expect(nextResultStatus("approved", "publish")).toBe("published");
  });

  it("a rejected batch can be edited and resubmitted", () => {
    expect(nextResultStatus("submitted", "reject")).toBe("rejected");
    expect(nextResultStatus("rejected", "edit")).toBe("rejected");
    expect(nextResultStatus("rejected", "submit")).toBe("submitted");
  });

  it("locks marks once submitted, approved or published", () => {
    for (const status of ["submitted", "approved", "published"] as const)
      expect(nextResultStatus(status, "edit")).toBeNull();
  });

  it("cannot skip approval or publish twice", () => {
    expect(nextResultStatus("draft", "publish")).toBeNull();
    expect(nextResultStatus("submitted", "publish")).toBeNull();
    expect(nextResultStatus("published", "publish")).toBeNull();
    expect(nextResultStatus("draft", "approve")).toBeNull();
  });
});

describe("leave", () => {
  it("only pending requests can be decided or cancelled", () => {
    expect(nextLeaveStatus("pending", "approve")).toBe("approved");
    expect(nextLeaveStatus("pending", "reject")).toBe("rejected");
    expect(nextLeaveStatus("pending", "cancel")).toBe("cancelled");
    expect(nextLeaveStatus("approved", "cancel")).toBeNull();
    expect(nextLeaveStatus("rejected", "approve")).toBeNull();
  });

  it("lists working days and skips Sundays", () => {
    // 2026-11-13 is a Friday; 15 is a Sunday.
    expect(leaveWorkingDays("2026-11-13", "2026-11-17")).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-16",
      "2026-11-17",
    ]);
    expect(leaveWorkingDays("2026-11-15", "2026-11-15")).toEqual([]);
    expect(leaveWorkingDays("2026-11-16", "2026-11-16")).toEqual(["2026-11-16"]);
  });
});
