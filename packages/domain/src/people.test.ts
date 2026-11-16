import { describe, expect, it } from "vitest";
import {
  classKey,
  type ImportContext,
  normalizeIndianPhone,
  parseDate,
  parseGender,
  type RawStudentRow,
  validateStudentImport,
} from "./people";

describe("normalizeIndianPhone", () => {
  it("accepts common ways of writing a mobile number", () => {
    for (const value of [
      "9876543210",
      "+91 98765 43210",
      "98765-43210",
      "09876543210",
      "919876543210",
    ]) {
      expect(normalizeIndianPhone(value)).toBe("9876543210");
    }
  });
  it("rejects numbers that are not Indian mobiles", () => {
    for (const value of ["12345", "5876543210", "98765432101", "abcdefghij", ""]) {
      expect(normalizeIndianPhone(value)).toBeNull();
    }
  });
});

describe("parseDate", () => {
  it("reads ISO and day-first dates", () => {
    expect(parseDate("2014-08-05")).toBe("2014-08-05");
    expect(parseDate("05/08/2014")).toBe("2014-08-05");
    expect(parseDate("5-8-2014")).toBe("2014-08-05");
  });
  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2014")).toBeNull();
    expect(parseDate("2014-13-01")).toBeNull();
    expect(parseDate("yesterday")).toBeNull();
  });
});

describe("parseGender", () => {
  it("understands common spellings", () => {
    expect(parseGender("F")).toBe("female");
    expect(parseGender(" Boy ")).toBe("male");
    expect(parseGender("other")).toBe("other");
    expect(parseGender("x")).toBeNull();
  });
});

const context: ImportContext = {
  sectionIds: new Map([[classKey("Class 6", "A"), "section-6a"]]),
  existingAdmissionNos: new Set(["old-1"]),
};

const row = (over: Partial<RawStudentRow> = {}): RawStudentRow => ({
  row: 2,
  admissionNo: "A-100",
  fullName: "Asha Verma",
  dateOfBirth: "05/08/2014",
  gender: "Female",
  className: "class 6",
  sectionName: "a",
  guardianName: "Ravi Verma",
  guardianEmail: "Ravi@Example.com",
  guardianPhone: "98765 43210",
  ...over,
});

describe("validateStudentImport", () => {
  it("accepts a good row and cleans the values", () => {
    const { valid, errors } = validateStudentImport([row()], context);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      admissionNo: "A-100",
      dateOfBirth: "2014-08-05",
      gender: "female",
      sectionId: "section-6a",
      guardian: { fullName: "Ravi Verma", email: "ravi@example.com", phone: "9876543210" },
    });
  });

  it("allows optional columns to be empty", () => {
    const { valid, errors } = validateStudentImport(
      [
        row({
          dateOfBirth: "",
          gender: "",
          guardianName: "",
          guardianEmail: "",
          guardianPhone: "",
        }),
      ],
      context,
    );
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ dateOfBirth: null, gender: null, guardian: null });
  });

  it("reports every problem in a row at once", () => {
    const { errors } = validateStudentImport(
      [
        row({
          admissionNo: "",
          fullName: "",
          dateOfBirth: "31/02/2014",
          gender: "?",
          className: "Class 9",
          guardianEmail: "nope",
          guardianPhone: "123",
        }),
      ],
      context,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.messages.length).toBeGreaterThanOrEqual(6);
  });

  it("flags admission numbers that exist already or repeat in the file", () => {
    const { valid, errors } = validateStudentImport(
      [
        row({ row: 2, admissionNo: "OLD-1" }),
        row({ row: 3, admissionNo: "B-1" }),
        row({ row: 4, admissionNo: "b-1" }),
      ],
      context,
    );
    expect(valid.map((v) => v.row)).toEqual([3]);
    expect(errors.map((e) => e.row)).toEqual([2, 4]);
    expect(errors[1]?.messages[0]).toContain("row 3");
  });

  it("needs a guardian name when other guardian details are given", () => {
    const { errors } = validateStudentImport([row({ guardianName: "" })], context);
    expect(errors[0]?.messages).toContain("Guardian name is missing");
  });
});
