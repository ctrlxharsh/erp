import type { Metadata } from "next";
import { MarksSheet } from "./marks-sheet";

export const metadata: Metadata = { title: "Enter marks" };

export default async function MarksSheetPage({
  params,
}: {
  params: Promise<{ examId: string; sectionId: string; subjectId: string }>;
}) {
  const key = await params;
  return <MarksSheet {...key} />;
}
