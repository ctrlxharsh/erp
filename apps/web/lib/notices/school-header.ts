import "server-only";
import sharp from "sharp";
import { getServerApi } from "@/lib/trpc/server";

export interface SchoolHeader {
  name: string;
  address: string | null;
  affiliationNo: string | null;
  phone: string | null;
  logoPng: Buffer | null;
}

/** The school's branding for generated documents (CONSTITUTION §6.7), loaded through the API. */
export async function loadSchoolHeader(): Promise<SchoolHeader> {
  const api = await getServerApi();
  const setup = await api.setup.get();
  let logoPng: Buffer | null = null;
  if (setup.profile.logoFileId) {
    try {
      const { url } = await api.files.downloadUrl({ fileId: setup.profile.logoFileId });
      const response = await fetch(url);
      if (response.ok)
        logoPng = await sharp(Buffer.from(await response.arrayBuffer()))
          .resize(240, 240, { fit: "inside" })
          .png()
          .toBuffer();
    } catch {
      logoPng = null;
    }
  }
  const { name, address, affiliationNo, phone } = setup.profile;
  return { name, address, affiliationNo, phone, logoPng };
}
