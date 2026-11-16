import type { Metadata } from "next";
import { NoticeForm } from "../../notice-form";

export const metadata: Metadata = { title: "Edit notice" };

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoticeForm noticeId={id} />;
}
