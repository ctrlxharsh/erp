import { Inbox } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function TodayPage() {
  const t = await getTranslations("today");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-muted-foreground">{t("emptyBody")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
