import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getServerApi } from "@/lib/trpc/server";
import { SchoolsTable } from "./schools-table";

export const metadata: Metadata = { title: "Schools" };

export default async function SchoolsPage() {
  const t = await getTranslations("platform");
  const me = await (await getServerApi()).session.me();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">{t("schoolsTitle")}</h1>
        {me.platformRole === "super_admin" ? (
          <Button asChild>
            <Link href="/platform/schools/new">{t("newSchool")}</Link>
          </Button>
        ) : null}
      </div>
      <SchoolsTable />
    </div>
  );
}
