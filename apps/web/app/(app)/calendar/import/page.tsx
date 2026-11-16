import type { Metadata } from "next";
import { CalendarImport } from "./calendar-import";

export const metadata: Metadata = { title: "Import calendar" };

export default function CalendarImportPage() {
  return <CalendarImport />;
}
