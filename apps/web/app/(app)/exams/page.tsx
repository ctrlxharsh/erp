import type { Metadata } from "next";
import { ExamsList } from "./exams-list";

export const metadata: Metadata = { title: "Exams" };

export default function ExamsPage() {
  return <ExamsList />;
}
