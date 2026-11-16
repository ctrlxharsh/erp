import type { Metadata } from "next";
import { HomeworkList } from "./homework-list";

export const metadata: Metadata = { title: "Homework" };

export default function HomeworkPage() {
  return <HomeworkList />;
}
