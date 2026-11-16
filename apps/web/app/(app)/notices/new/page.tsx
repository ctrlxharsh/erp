import type { Metadata } from "next";
import { NoticeForm } from "../notice-form";

export const metadata: Metadata = { title: "Write a notice" };

export default function NewNoticePage() {
  return <NoticeForm />;
}
