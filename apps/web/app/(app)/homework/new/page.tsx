import type { Metadata } from "next";
import { HomeworkForm } from "./homework-form";

export const metadata: Metadata = { title: "Set homework" };

export default function NewHomeworkPage() {
  return <HomeworkForm />;
}
