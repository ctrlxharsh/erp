import type { Metadata } from "next";
import { StaffTable } from "./staff-table";

export const metadata: Metadata = { title: "Teachers and staff" };

export default function StaffPage() {
  return <StaffTable />;
}
