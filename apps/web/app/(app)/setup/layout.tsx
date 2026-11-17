import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { getServerApi } from "@/lib/trpc/server";
import { SetupTabs } from "./setup-tabs";

export default async function SetupLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("setup");
  const api = await getServerApi();
  // Only people who can set the school up see this area; the API checks again on every call.
  const current = await api.school.current().catch(() => null);
  if (!current?.permissions.includes("school.setup")) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t("title")} />
      <SetupTabs />
      {children}
    </div>
  );
}
