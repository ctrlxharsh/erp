import type { Metadata } from "next";
import { NoticeDetail } from "./notice-detail";

export const metadata: Metadata = { title: "Notice" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoticeDetail noticeId={id} />;
}
