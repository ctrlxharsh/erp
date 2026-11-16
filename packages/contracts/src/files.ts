import { declarableMimeTypes, filePurposeNames, MAX_UPLOAD_BYTES } from "@erp/domain";
import { z } from "zod";

export const filePurposeSchema = z.enum(filePurposeNames as [string, ...string[]]);

export const requestUploadInputSchema = z.object({
  purpose: filePurposeSchema,
  contentType: z.enum(declarableMimeTypes),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

/** Where the browser sends the file: a presigned POST form or a presigned PUT. */
export const signedUploadSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("PUT"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    method: z.literal("POST"),
    url: z.string(),
    fields: z.record(z.string(), z.string()),
  }),
]);

export const requestUploadOutputSchema = z.object({
  fileId: z.uuid(),
  upload: signedUploadSchema,
});

export const fileIdInputSchema = z.object({ fileId: z.uuid() });

export const storedFileSchema = z.object({
  id: z.uuid(),
  purpose: filePurposeSchema,
  mime: z.enum(["image/webp", "application/pdf"]),
  sizeBytes: z.number().int(),
});
export type StoredFile = z.infer<typeof storedFileSchema>;

export const downloadUrlSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.number().int(),
});
