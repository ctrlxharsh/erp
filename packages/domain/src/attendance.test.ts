import { describe, expect, it } from "vitest";
import { attendanceAccess, attendancePercent, schoolToday } from "./attendance";

describe("schoolToday", () => {
  it("uses the school's wall clock, not UTC", () => {
    // 20:00 UTC on 15 Nov is already 01:30 on 16 Nov in India.
    expect(schoolToday(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-16");
    expect(schoolToday(new Date("2026-11-15T18:29:59Z"))).toBe("2026-11-15");
    expect(schoolToday(new Date("2026-11-15T18:30:00Z"))).toBe("2026-11-16");
  });
});

const base = { today: "2026-11-16", isHoliday: false, isClassTeacher: false, canCorrect: false };

describe("attendanceAccess", () => {
  it("lets the class teacher mark today", () => {
    expect(attendanceAccess({ ...base, date: "2026-11-16", isClassTeacher: true })).toEqual({
      kind: "teacher",
    });
  });

  it("does not let other teachers mark", () => {
    expect(attendanceAccess({ ...base, date: "2026-11-16" })).toEqual({
      kind: "denied",
      reason: "not_class_teacher",
    });
  });

  it("closes the teacher's window at midnight", () => {
    expect(attendanceAccess({ ...base, date: "2026-11-15", isClassTeacher: true })).toEqual({
      kind: "denied",
      reason: "window_closed",
    });
  });

  it("lets an admin correct earlier days", () => {
    expect(attendanceAccess({ ...base, date: "2026-11-01", canCorrect: true })).toEqual({
      kind: "correction",
    });
  });

  it("an admin who is not the class teacher cannot mark today", () => {
    expect(attendanceAccess({ ...base, date: "2026-11-16", canCorrect: true })).toEqual({
      kind: "denied",
      reason: "not_class_teacher",
    });
  });

  it("blocks future days and holidays for everyone", () => {
    expect(
      attendanceAccess({ ...base, date: "2026-11-17", isClassTeacher: true, canCorrect: true }),
    ).toEqual({ kind: "denied", reason: "future" });
    expect(
      attendanceAccess({
        ...base,
        date: "2026-11-16",
        isHoliday: true,
        isClassTeacher: true,
        canCorrect: true,
      }),
    ).toEqual({ kind: "denied", reason: "holiday" });
    expect(
      attendanceAccess({ ...base, date: "2026-11-01", isHoliday: true, canCorrect: true }),
    ).toEqual({ kind: "denied", reason: "holiday" });
  });
});

describe("attendancePercent", () => {
  it("counts late as present and leave as absent", () => {
    expect(attendancePercent({ present: 8, late: 1, absent: 1, leave: 0 })).toBe(90);
    expect(attendancePercent({ present: 1, late: 0, absent: 0, leave: 1 })).toBe(50);
  });
  it("is null when nothing was marked", () => {
    expect(attendancePercent({ present: 0, late: 0, absent: 0, leave: 0 })).toBeNull();
  });
});
