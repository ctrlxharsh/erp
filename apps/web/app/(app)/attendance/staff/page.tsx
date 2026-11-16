import type { Metadata } from "next";
import { StaffAttendance } from "./staff-attendance";

export const metadata: Metadata = { title: "Staff attendance" };

export default function StaffAttendancePage() {
  return <StaffAttendance />;
}
