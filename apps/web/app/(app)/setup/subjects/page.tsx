import type { Metadata } from "next";
import { SubjectsPanel } from "./subjects-panel";

export const metadata: Metadata = { title: "Subjects" };

export default function SubjectsPage() {
  return <SubjectsPanel />;
}
