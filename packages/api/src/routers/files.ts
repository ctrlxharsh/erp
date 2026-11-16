import {
  downloadUrlSchema,
  fileIdInputSchema,
  requestUploadInputSchema,
  requestUploadOutputSchema,
  storedFileSchema,
} from "@erp/contracts";
import { schema, withSchool } from "@erp/db";
import {
  detectFileType,
  type FilePurpose,
  filePurposes,
  incomingKey,
  isImageType,
  MAX_UPLOAD_BYTES,
  type Permission,
  storedKey,
} from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { toWebp } from "../images";
import { router, schoolProcedure } from "../trpc";

const UPLOAD_LINK_SECONDS = 600;
const DOWNLOAD_LINK_SECONDS = 300;

const refusal = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

function purposeConfig(purpose: string) {
  return filePurposes[purpose as FilePurpose];
}

export const filesRouter = router({
  /** Step 1: check the caller may upload this kind of file, then hand out a short-lived upload link. */
  requestUpload: schoolProcedure
    .input(requestUploadInputSchema)
    .output(requestUploadOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const config = purposeConfig(input.purpose);
      if (!ctx.permissions.has(config.upload as Permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to upload this.",
        });
      }
      if (config.accept === "image" && input.contentType === "application/pdf") {
        throw refusal("Please upload an image (JPEG, PNG or WebP).");
      }
      const [row] = await withSchool(ctx.db, ctx.schoolId, (scope) =>
        scope.tx
          .insert(schema.files)
          .values({
            schoolId: ctx.schoolId,
            purpose: input.purpose,
            ownerUserId: ctx.user.id,
          })
          .returning({ id: schema.files.id }),
      );
      if (!row)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not start the upload.",
        });
      const upload = await ctx.storage.signedUpload(incomingKey(ctx.schoolId, row.id), {
        contentType: input.contentType,
        maxBytes: Math.min(input.sizeBytes, MAX_UPLOAD_BYTES),
        expiresInSeconds: UPLOAD_LINK_SECONDS,
      });
      return { fileId: row.id, upload };
    }),

  /** Step 2: after the browser uploaded, check the real bytes, convert and store the final file. */
  finalize: schoolProcedure
    .input(fileIdInputSchema)
    .output(storedFileSchema)
    .mutation(async ({ ctx, input }) => {
      const [pending] = await withSchool(ctx.db, ctx.schoolId, (scope) =>
        scope.tx
          .select()
          .from(schema.files)
          .where(
            and(
              eq(schema.files.id, input.fileId),
              eq(schema.files.status, "pending"),
              eq(schema.files.ownerUserId, ctx.user.id),
            ),
          ),
      );
      if (!pending)
        throw new TRPCError({ code: "NOT_FOUND", message: "This upload was not found." });

      const config = purposeConfig(pending.purpose);
      const source = incomingKey(ctx.schoolId, pending.id);
      const discard = async () => {
        await ctx.storage.delete(source).catch(() => undefined);
        await withSchool(ctx.db, ctx.schoolId, (scope) =>
          scope.tx.delete(schema.files).where(eq(schema.files.id, pending.id)),
        );
      };

      let bytes: Uint8Array;
      try {
        bytes = await ctx.storage.get(source);
      } catch {
        throw refusal("The file did not arrive. Please try uploading again.");
      }

      const type = detectFileType(bytes);
      const problem =
        bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES
          ? "The file is too large. The limit is 10 MB."
          : type === null
            ? "This file type is not allowed. Please upload a JPEG, PNG, WebP or PDF."
            : type === "heic"
              ? "HEIC photos are not supported yet. Please share the photo as a JPEG or PNG."
              : type === "pdf" && config.accept === "image"
                ? "Please upload an image (JPEG, PNG or WebP)."
                : null;
      if (problem || type === null) {
        await discard();
        throw refusal(problem ?? "This file type is not allowed.");
      }

      let finalBytes: Uint8Array;
      let mime: "image/webp" | "application/pdf";
      let ext: "webp" | "pdf";
      if (isImageType(type)) {
        try {
          finalBytes = await toWebp(bytes);
        } catch {
          await discard();
          throw refusal("This image could not be read. Please try a different file.");
        }
        mime = "image/webp";
        ext = "webp";
      } else {
        finalBytes = bytes;
        mime = "application/pdf";
        ext = "pdf";
      }

      const key = storedKey(ctx.schoolId, pending.purpose as FilePurpose, pending.id, ext);
      await ctx.storage.put(key, finalBytes, mime);
      await ctx.storage.delete(source).catch(() => undefined);
      await withSchool(ctx.db, ctx.schoolId, (scope) =>
        scope.tx
          .update(schema.files)
          .set({ status: "ready", key, mime, sizeBytes: finalBytes.length, readyAt: new Date() })
          .where(eq(schema.files.id, pending.id)),
      );
      return { id: pending.id, purpose: pending.purpose, mime, sizeBytes: finalBytes.length };
    }),

  /** Short-lived download link, issued only to the uploader or to someone allowed to view this kind of file. */
  downloadUrl: schoolProcedure
    .input(fileIdInputSchema)
    .output(downloadUrlSchema)
    .query(async ({ ctx, input }) => {
      const [file] = await withSchool(ctx.db, ctx.schoolId, (scope) =>
        scope.tx
          .select()
          .from(schema.files)
          .where(and(eq(schema.files.id, input.fileId), eq(schema.files.status, "ready"))),
      );
      const allowed =
        file &&
        (file.ownerUserId === ctx.user.id ||
          ctx.permissions.has(purposeConfig(file.purpose).view as Permission));
      // Same answer for "does not exist" and "not yours": never confirm another file exists.
      if (!file?.key || !allowed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This file was not found." });
      }
      return {
        url: await ctx.storage.signedDownloadUrl(file.key, DOWNLOAD_LINK_SECONDS),
        expiresInSeconds: DOWNLOAD_LINK_SECONDS,
      };
    }),
});
