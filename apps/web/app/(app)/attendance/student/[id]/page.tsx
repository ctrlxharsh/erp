import type { Metadata } from "next";
import { StudentAttendance } from "./student-attendance";

export const metadata: Metadata = { title: "Attendance" };

export default async function StudentAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentAttendance studentId={id} />;
}
