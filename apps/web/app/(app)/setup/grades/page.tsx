import type { Metadata } from "next";
import { GradesPanel } from "./grades-panel";

export const metadata: Metadata = { title: "Grade scale" };

export default function GradesPage() {
  return <GradesPanel />;
}
