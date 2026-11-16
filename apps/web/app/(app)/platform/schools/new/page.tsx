import type { Metadata } from "next";
import { CreateSchoolForm } from "./create-school-form";

export const metadata: Metadata = { title: "Add school" };

export default function NewSchoolPage() {
  return <CreateSchoolForm />;
}
