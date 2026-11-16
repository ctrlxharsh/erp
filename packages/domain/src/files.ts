import type { Permission } from "./permissions";

/**
 * What each upload is for, what it may contain, and who may upload and view it
 * (CONSTITUTION §6.6). Add a purpose here when a module needs file uploads.
 */
export const filePurposes = {
  school_logo: { accept: "image", upload: "school.setup", view: "school.view" },
  study_material: { accept: "any", upload: "material.manage", view: "material.view" },
  homework_attachment: { accept: "any", upload: "homework.manage", view: "homework.view" },
  notice_attachment: { accept: "any", upload: "notice.write", view: "notice.view" },
  student_document: { accept: "any", upload: "people.manage", view: "people.view" },
  // Leave documents are visible to the person who uploaded them and to whoever approves leave.
  leave_document: { accept: "any", upload: "leave.apply", view: "leave.approve" },
} as const satisfies Record<
  string,
  { accept: "image" | "any"; upload: Permission; view: Permission }
>;

export type FilePurpose = keyof typeof filePurposes;
export const filePurposeNames = Object.keys(filePurposes) as FilePurpose[];

/** Images up to 10 MB in, PDFs up to 10 MB (CONSTITUTION §6.6). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Longest edge of a stored image, in pixels. */
export const MAX_IMAGE_EDGE = 2048;

export type DetectedFileType = "jpeg" | "png" | "webp" | "pdf" | "heic";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

/** Identifies a file by its first bytes, never by its name or the type the client claims. */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  // ISO base media "ftyp" box with a HEIC/HEIF brand.
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand))
      return "heic";
  }
  return null;
}

export const isImageType = (type: DetectedFileType) => type !== "pdf";

/** MIME types a client may declare when asking for an upload link. */
export const declarableMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export function storedKey(
  schoolId: string,
  purpose: FilePurpose,
  fileId: string,
  ext: "webp" | "pdf",
) {
  return `schools/${schoolId}/${purpose}/${fileId}.${ext}`;
}

export function incomingKey(schoolId: string, fileId: string) {
  return `incoming/${schoolId}/${fileId}`;
}
