import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getServerApi } from "@/lib/trpc/server";
import { SchoolsTable } from "./schools-table";

export const metadata: Metadata = { title: "Schools" };

export default async function SchoolsPage() {
  const t = await getTranslations("platform");
  const me = await (await getServerApi()).session.me();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("schoolsTitle")}
        actions={
          me.platformRole === "super_admin" ? (
            <Button asChild>
              <Link href="/platform/schools/new">{t("newSchool")}</Link>
            </Button>
          ) : null
        }
      />
      <SchoolsTable />
    </div>
  );
}
