import type { Metadata } from "next";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import students" };

export default function ImportPage() {
  return <ImportWizard />;
}
