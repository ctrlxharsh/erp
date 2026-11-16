import type { Metadata } from "next";
import { ClassesPanel } from "./classes-panel";

export const metadata: Metadata = { title: "Classes and sections" };

export default function ClassesPage() {
  return <ClassesPanel />;
}
