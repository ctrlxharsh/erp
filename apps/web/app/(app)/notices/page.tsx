import type { Metadata } from "next";
import { Suspense } from "react";
import { NoticesList } from "./notices-list";

export const metadata: Metadata = { title: "Notices" };

export default function NoticesPage() {
  return (
    <Suspense>
      <NoticesList />
    </Suspense>
  );
}
