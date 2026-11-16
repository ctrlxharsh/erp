import type { Metadata } from "next";
import { StudentForm } from "../student-form";

export const metadata: Metadata = { title: "Add student" };

export default function NewStudentPage() {
  return <StudentForm />;
}
