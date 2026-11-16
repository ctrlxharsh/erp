/** Rules for people records and the student Excel import. Pure, so they are easy to test. */

/** Columns of the student import sheet, in order. The header row must match these titles. */
export const studentImportColumns = [
  "Admission no",
  "Full name",
  "Date of birth",
  "Gender",
  "Class",
  "Section",
  "Guardian name",
  "Guardian email",
  "Guardian phone",
] as const;

export const MAX_IMPORT_ROWS = 1000;

export type Gender = "female" | "male" | "other";

/** Indian mobile number as 10 digits, or null if it is not one. Accepts +91, 91 and 0 prefixes. */
export function normalizeIndianPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => emailPattern.test(value);

/** Accepts 2026-04-01, 01/04/2026 and 1-4-2026 (day first, as written in India). Returns ISO or null. */
export function parseDate(input: string): string | null {
  const text = input.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (iso)
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])] as [
      number,
      number,
      number,
    ];
  else if (dmy)
    [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])] as [
      number,
      number,
      number,
    ];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseGender(input: string): Gender | null {
  const value = input.trim().toLowerCase();
  if (["f", "female", "girl"].includes(value)) return "female";
  if (["m", "male", "boy"].includes(value)) return "male";
  if (["o", "other", "others"].includes(value)) return "other";
  return null;
}

export interface RawStudentRow {
  /** 1-based row number in the sheet, for error messages. */
  row: number;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  className: string;
  sectionName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
}

export interface ValidStudentRow {
  row: number;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  sectionId: string;
  guardian: { fullName: string; email: string | null; phone: string | null } | null;
}

export interface RowError {
  row: number;
  messages: string[];
}

export interface ImportContext {
  /** Key is `classKey(class, section)`. */
  sectionIds: ReadonlyMap<string, string>;
  existingAdmissionNos: ReadonlySet<string>;
}

export const classKey = (className: string, sectionName: string) =>
  `${className.trim().toLowerCase()}|${sectionName.trim().toLowerCase()}`;

/** Validates every row and reports all problems at once, so the sheet can be fixed in one go. */
export function validateStudentImport(rows: readonly RawStudentRow[], context: ImportContext) {
  const valid: ValidStudentRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  for (const raw of rows) {
    const messages: string[] = [];
    const admissionNo = raw.admissionNo.trim();
    const fullName = raw.fullName.trim().replace(/\s+/g, " ");

    if (!admissionNo) messages.push("Admission number is missing");
    else if (context.existingAdmissionNos.has(admissionNo.toLowerCase())) {
      messages.push(`Admission number ${admissionNo} already exists in this school`);
    } else if (seen.has(admissionNo.toLowerCase())) {
      messages.push(
        `Admission number ${admissionNo} is repeated (also on row ${seen.get(admissionNo.toLowerCase())})`,
      );
    }
    if (admissionNo)
      seen.set(admissionNo.toLowerCase(), seen.get(admissionNo.toLowerCase()) ?? raw.row);

    if (fullName.length < 2) messages.push("Full name is missing");

    let dateOfBirth: string | null = null;
    if (raw.dateOfBirth.trim()) {
      dateOfBirth = parseDate(raw.dateOfBirth);
      if (!dateOfBirth) messages.push("Date of birth is not a valid date (use dd/mm/yyyy)");
    }

    let gender: Gender | null = null;
    if (raw.gender.trim()) {
      gender = parseGender(raw.gender);
      if (!gender) messages.push("Gender must be Female, Male or Other");
    }

    const sectionId = context.sectionIds.get(classKey(raw.className, raw.sectionName));
    if (!raw.className.trim() || !raw.sectionName.trim())
      messages.push("Class and section are required");
    else if (!sectionId)
      messages.push(
        `Class ${raw.className.trim()} section ${raw.sectionName.trim()} does not exist`,
      );

    let guardian: ValidStudentRow["guardian"] = null;
    const guardianName = raw.guardianName.trim().replace(/\s+/g, " ");
    const guardianEmail = raw.guardianEmail.trim().toLowerCase();
    const guardianPhone = raw.guardianPhone.trim();
    if (guardianName || guardianEmail || guardianPhone) {
      if (!guardianName) messages.push("Guardian name is missing");
      if (guardianEmail && !isEmail(guardianEmail)) messages.push("Guardian email is not valid");
      const phone = guardianPhone ? normalizeIndianPhone(guardianPhone) : null;
      if (guardianPhone && !phone)
        messages.push("Guardian phone is not a valid 10-digit mobile number");
      guardian = { fullName: guardianName, email: guardianEmail || null, phone };
    }

    if (messages.length > 0 || !sectionId) errors.push({ row: raw.row, messages });
    else
      valid.push({ row: raw.row, admissionNo, fullName, dateOfBirth, gender, sectionId, guardian });
  }
  return { valid, errors };
}
