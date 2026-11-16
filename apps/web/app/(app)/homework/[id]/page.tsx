import type { Metadata } from "next";
import { HomeworkDetail } from "./homework-detail";

export const metadata: Metadata = { title: "Homework" };

export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HomeworkDetail homeworkId={id} />;
}
