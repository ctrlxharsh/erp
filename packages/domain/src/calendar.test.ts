import { describe, expect, it } from "vitest";
import { isHoliday, validateCalendarImport } from "./calendar";

const row = (over: Partial<Parameters<typeof validateCalendarImport>[0][number]> = {}) => ({
  row: 2,
  startDate: "15/08/2026",
  endDate: "",
  title: "Independence Day",
  type: "Holiday",
  audience: "",
  ...over,
});

describe("validateCalendarImport", () => {
  it("accepts a one-day holiday and defaults the audience to everyone", () => {
    const { valid, errors } = validateCalendarImport([row()]);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      startDate: "2026-08-15",
      endDate: "2026-08-15",
      type: "holiday",
      audience: "all",
    });
  });

  it("reads ranges and friendly audience names", () => {
    const { valid } = validateCalendarImport([
      row({
        startDate: "01/10/2026",
        endDate: "05/10/2026",
        title: "Diwali break",
        audience: "Students and parents",
      }),
    ]);
    expect(valid[0]).toMatchObject({ endDate: "2026-10-05", audience: "students_parents" });
  });

  it("reports all problems in a row", () => {
    const { errors } = validateCalendarImport([
      row({ startDate: "nope", title: "", type: "Party", audience: "Aliens" }),
      row({ row: 3, startDate: "10/10/2026", endDate: "09/10/2026" }),
    ]);
    expect(errors[0]?.messages).toHaveLength(4);
    expect(errors[1]?.messages).toEqual(["End date is before the start date"]);
  });
});

describe("isHoliday", () => {
  const events = [
    { startDate: "2026-10-01", endDate: "2026-10-05", type: "holiday" },
    { startDate: "2026-10-20", endDate: "2026-10-20", type: "exam" },
  ];
  it("is true only inside a holiday range", () => {
    expect(isHoliday("2026-10-03", events)).toBe(true);
    expect(isHoliday("2026-10-05", events)).toBe(true);
    expect(isHoliday("2026-10-06", events)).toBe(false);
  });
  it("ignores events that are not holidays", () => {
    expect(isHoliday("2026-10-20", events)).toBe(false);
  });
});
