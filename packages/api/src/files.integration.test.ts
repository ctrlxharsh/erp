import { createDb, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessStore } from "./access-store";
import { createNeonStorage } from "./neon-storage";
import { createCaller } from "./root";
import type { Context } from "./trpc";

/**
 * The whole upload pipeline against the real Neon `test` database and bucket (CONSTITUTION §6.6).
 * Skipped when DATABASE_URL or the storage variables are missing.
 */
const ready = Boolean(process.env.DATABASE_URL && process.env.AWS_ENDPOINT_URL_S3);
const run = ready ? describe : describe.skip;

const admin = "00000000-0000-7000-8000-0000000000a1";
const teacher = "00000000-0000-7000-8000-0000000000a2";
const student = "00000000-0000-7000-8000-0000000000a3";
const outsider = "00000000-0000-7000-8000-0000000000b1";

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return error.code;
    throw error;
  }
  return "OK";
}

run("files pipeline (Neon database + Object Storage)", () => {
  const db = createDb(process.env.DATABASE_URL ?? "postgres://unused");
  const storage = createNeonStorage("uploads");
  const tag = `files-test-${Date.now()}`;
  let schoolA = "";
  let schoolB = "";
  const keys: string[] = [];

  const as = (userId: string, activeSchoolId: string): Context => ({
    db,
    storage,
    authAdmin: null as never,
    store: createAccessStore(db),
    user: { id: userId, email: `${userId}@example.com`, name: "Test" },
    activeSchoolId,
  });

  beforeAll(async () => {
    const [a, b] = await db
      .insert(schema.schools)
      .values([{ name: `${tag}-A` }, { name: `${tag}-B` }])
      .returning({ id: schema.schools.id });
    schoolA = a?.id ?? "";
    schoolB = b?.id ?? "";
    await db.insert(schema.memberships).values([
      { userId: admin, schoolId: schoolA, roles: ["school_admin"] },
      { userId: teacher, schoolId: schoolA, roles: ["teacher"] },
      { userId: student, schoolId: schoolA, roles: ["student"] },
      { userId: outsider, schoolId: schoolB, roles: ["school_admin"] },
    ]);
  });

  afterAll(async () => {
    for (const key of keys) await storage.delete(key).catch(() => undefined);
    const ids = [schoolA, schoolB];
    await db.delete(schema.files).where(inArray(schema.files.schoolId, ids));
    await db.delete(schema.memberships).where(inArray(schema.memberships.schoolId, ids));
    await db.delete(schema.schools).where(inArray(schema.schools.id, ids));
  });

  /** Uploads bytes the way a browser does: straight to the presigned target. */
  async function upload(
    ctx: Context,
    purpose: "school_logo" | "study_material",
    bytes: Uint8Array,
    contentType: string,
  ) {
    const api = createCaller(ctx);
    const { fileId, upload } = await api.files.requestUpload({
      purpose,
      contentType: contentType as "image/jpeg",
      sizeBytes: bytes.length,
    });
    if (upload.method === "POST") {
      const form = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
      form.append("file", new Blob([bytes as never], { type: contentType }));
      const response = await fetch(upload.url, { method: "POST", body: form });
      expect(response.ok).toBe(true);
    } else {
      const response = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: bytes as never,
      });
      expect(response.ok).toBe(true);
    }
    return { api, fileId };
  }

  async function photo() {
    return new Uint8Array(
      await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#02969e" } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "private-owner" } })
        .toBuffer(),
    );
  }

  it("converts an uploaded photo to a small, metadata-free WebP under the school's prefix", async () => {
    const { api, fileId } = await upload(
      as(admin, schoolA),
      "school_logo",
      await photo(),
      "image/jpeg",
    );
    const file = await api.files.finalize({ fileId });
    expect(file.mime).toBe("image/webp");
    const [row] = await db.select().from(schema.files).where(sql`${schema.files.id} = ${fileId}`);
    expect(row?.status).toBe("ready");
    expect(row?.key).toBe(`schools/${schoolA}/school_logo/${fileId}.webp`);
    if (row?.key) keys.push(row.key);

    const stored = await storage.get(row?.key ?? "");
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2048);
    expect(meta.exif).toBeUndefined();
    // The temporary upload is gone.
    await expect(storage.get(`incoming/${schoolA}/${fileId}`)).rejects.toThrow();
  });

  it("gives a working short-lived download link to people who may view the school logo", async () => {
    const { api, fileId } = await upload(
      as(admin, schoolA),
      "school_logo",
      await photo(),
      "image/jpeg",
    );
    await api.files.finalize({ fileId });
    const [row] = await db.select().from(schema.files).where(sql`${schema.files.id} = ${fileId}`);
    if (row?.key) keys.push(row.key);

    const link = await createCaller(as(student, schoolA)).files.downloadUrl({ fileId });
    expect(link.expiresInSeconds).toBeLessThanOrEqual(300);
    const response = await fetch(link.url);
    expect(response.ok).toBe(true);
    expect((await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).format).toBe(
      "webp",
    );
  });

  it("stores PDFs as PDFs", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const { api, fileId } = await upload(
      as(teacher, schoolA),
      "study_material",
      pdf,
      "application/pdf",
    );
    const file = await api.files.finalize({ fileId });
    expect(file.mime).toBe("application/pdf");
    const [row] = await db.select().from(schema.files).where(sql`${schema.files.id} = ${fileId}`);
    expect(row?.key).toMatch(/\.pdf$/);
    if (row?.key) keys.push(row.key);
  });

  it("refuses a disguised file and cleans up", async () => {
    const fake = new TextEncoder().encode("<?php system($_GET['x']); ?>");
    const { api, fileId } = await upload(
      as(teacher, schoolA),
      "study_material",
      fake,
      "application/pdf",
    );
    expect(await code(api.files.finalize({ fileId }))).toBe("BAD_REQUEST");
    const rows = await db.select().from(schema.files).where(sql`${schema.files.id} = ${fileId}`);
    expect(rows).toEqual([]);
    await expect(storage.get(`incoming/${schoolA}/${fileId}`)).rejects.toThrow();
  });

  it("checks permission before handing out an upload link", async () => {
    const body = { purpose: "school_logo", contentType: "image/png", sizeBytes: 1000 } as const;
    expect(await code(createCaller(as(teacher, schoolA)).files.requestUpload(body))).toBe(
      "FORBIDDEN",
    );
    expect(await code(createCaller(as(student, schoolA)).files.requestUpload(body))).toBe(
      "FORBIDDEN",
    );
  });

  it("rejects a PDF for an image-only purpose and oversized files", async () => {
    const api = createCaller(as(admin, schoolA));
    expect(
      await code(
        api.files.requestUpload({
          purpose: "school_logo",
          contentType: "application/pdf",
          sizeBytes: 100,
        }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await code(
        api.files.requestUpload({
          purpose: "school_logo",
          contentType: "image/png",
          sizeBytes: 11 * 1024 * 1024,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("never shows one school's file to another school", async () => {
    const { api, fileId } = await upload(
      as(admin, schoolA),
      "school_logo",
      await photo(),
      "image/jpeg",
    );
    await api.files.finalize({ fileId });
    const [row] = await db.select().from(schema.files).where(sql`${schema.files.id} = ${fileId}`);
    if (row?.key) keys.push(row.key);

    const other = createCaller(as(outsider, schoolB));
    expect(await code(other.files.downloadUrl({ fileId }))).toBe("NOT_FOUND");
    expect(await code(other.files.finalize({ fileId }))).toBe("NOT_FOUND");
  });

  it("lets only the uploader finalize their upload", async () => {
    const png = new Uint8Array(
      await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
        .png()
        .toBuffer(),
    );
    const { fileId } = await upload(as(admin, schoolA), "school_logo", png, "image/png");
    expect(await code(createCaller(as(teacher, schoolA)).files.finalize({ fileId }))).toBe(
      "NOT_FOUND",
    );
  });
});
