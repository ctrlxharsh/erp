/** The few object-storage operations the API needs. Implemented on Neon Object Storage; faked in tests. */
export type SignedUpload =
  | { method: "PUT"; url: string; headers?: Record<string, string> }
  | { method: "POST"; url: string; fields: Record<string, string> };

export interface ObjectStorage {
  /** A short-lived link the browser uploads to directly, limited to `maxBytes`. */
  signedUpload(
    key: string,
    opts: { contentType: string; maxBytes: number; expiresInSeconds: number },
  ): Promise<SignedUpload>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** A short-lived download link. Only issue it after a permission check. */
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}
