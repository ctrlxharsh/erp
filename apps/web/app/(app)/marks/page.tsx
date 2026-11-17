import type { Metadata } from "next";
import { MarksList } from "./marks-list";

export const metadata: Metadata = { title: "Marks entry" };

export default function MarksPage() {
  return <MarksList />;
}
