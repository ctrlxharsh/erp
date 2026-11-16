import "server-only";
import sharp from "sharp";
import { getServerApi } from "@/lib/trpc/server";

export interface NoticeDocument {
  title: string;
  body: string;
  refLabel: string | null;
  publishedAt: Date | null;
  audienceLabel: string;
  school: {
    name: string;
    address: string | null;
    affiliationNo: string | null;
    phone: string | null;
    logoPng: Buffer | null;
  };
}

const audienceLabels = {
  all: "All",
  teachers: "Teachers",
  students_parents: "Students and parents",
} as const;

/**
 * Loads a published notice with the school's branding, through the same API (and permission
 * checks) as the app. Throws if the notice is missing, not visible, or not published.
 */
export async function loadNoticeDocument(id: string): Promise<NoticeDocument | null> {
  const api = await getServerApi();
  const notice = await api.notices.get({ id }).catch(() => null);
  if (notice?.status !== "published") return null;
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
      logoPng = null; // A missing logo falls back to the school name only.
    }
  }
  return {
    title: notice.title,
    body: notice.body,
    refLabel: notice.refLabel,
    publishedAt: notice.publishedAt,
    audienceLabel: audienceLabels[notice.audience],
    school: {
      name: setup.profile.name,
      address: setup.profile.address,
      affiliationNo: setup.profile.affiliationNo,
      phone: setup.profile.phone,
      logoPng,
    },
  };
}

export const formatNoticeDate = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(date)
    : "";
