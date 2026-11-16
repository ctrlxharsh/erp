import { describe, expect, it } from "vitest";
import { detectFileType, filePurposes, incomingKey, isImageType, storedKey } from "./files";
import { permissions } from "./permissions";

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));

describe("detectFileType", () => {
  it("recognises JPEG, PNG, WebP and PDF by content", () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("jpeg");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(detectFileType(ascii("RIFF0000WEBPVP8 "))).toBe("webp");
    expect(detectFileType(ascii("%PDF-1.7\n"))).toBe("pdf");
  });

  it("recognises HEIC so it can be refused with a clear message", () => {
    expect(detectFileType(Uint8Array.from([0, 0, 0, 24, ...ascii("ftypheic")]))).toBe("heic");
  });

  it("does not trust the file name or a RIFF header alone", () => {
    expect(detectFileType(ascii("RIFF0000WAVEfmt "))).toBeNull();
    expect(detectFileType(ascii("<?php echo 1; ?>"))).toBeNull();
    expect(detectFileType(ascii("MZ\u0090\u0000"))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });

  it("separates images from documents", () => {
    expect(isImageType("jpeg")).toBe(true);
    expect(isImageType("pdf")).toBe(false);
  });
});

describe("filePurposes", () => {
  it("only reference real permissions", () => {
    for (const config of Object.values(filePurposes)) {
      expect(permissions).toContain(config.upload);
      expect(permissions).toContain(config.view);
    }
  });
});

describe("storage keys", () => {
  it("keep every school under its own prefix", () => {
    expect(storedKey("s1", "school_logo", "f1", "webp")).toBe("schools/s1/school_logo/f1.webp");
    expect(incomingKey("s1", "f1")).toBe("incoming/s1/f1");
  });
});
