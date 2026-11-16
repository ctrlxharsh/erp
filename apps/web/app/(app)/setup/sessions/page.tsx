import type { Metadata } from "next";
import { SessionsPanel } from "./sessions-panel";

export const metadata: Metadata = { title: "Academic sessions" };

export default function SessionsPage() {
  return <SessionsPanel />;
}
