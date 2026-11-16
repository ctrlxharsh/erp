import type { Metadata } from "next";
import { MaterialsView } from "./materials-view";

export const metadata: Metadata = { title: "Study material" };

export default function MaterialsPage() {
  return <MaterialsView />;
}
