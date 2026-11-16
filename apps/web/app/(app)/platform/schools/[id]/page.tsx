import type { Metadata } from "next";
import { SchoolDetail } from "./school-detail";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SchoolDetail schoolId={id} />;
}
