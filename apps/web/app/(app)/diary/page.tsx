import type { Metadata } from "next";
import { DiaryView } from "./diary-view";

export const metadata: Metadata = { title: "Class diary" };

export default function DiaryPage() {
  return <DiaryView />;
}
