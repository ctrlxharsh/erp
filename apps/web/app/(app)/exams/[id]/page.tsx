import type { Metadata } from "next";
import { ExamSchedule } from "./exam-schedule";

export const metadata: Metadata = { title: "Exam schedule" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamSchedule examId={id} />;
}
