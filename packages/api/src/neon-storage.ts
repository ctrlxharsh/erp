import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import type { ObjectStorage } from "./storage";

/**
 * Neon Object Storage through the Files SDK. Endpoint, region and credentials come from the
 * AWS_* variables that `neon deploy` writes. Swapping providers only means changing this file.
 */
export function createNeonStorage(bucket: string): ObjectStorage {
  const files = new Files({ adapter: neon({ bucket }) });
  return {
    signedUpload: (key, { contentType, maxBytes, expiresInSeconds }) =>
      files.signedUploadUrl(key, { expiresIn: expiresInSeconds, contentType, maxSize: maxBytes }),
    async get(key) {
      const file = await files.download(key);
      return new Uint8Array(await file.arrayBuffer());
    },
    async put(key, bytes, contentType) {
      await files.upload(key, bytes, { contentType });
    },
    async delete(key) {
      await files.delete(key);
    },
    signedDownloadUrl: (key, expiresInSeconds) => files.url(key, { expiresIn: expiresInSeconds }),
  };
}
