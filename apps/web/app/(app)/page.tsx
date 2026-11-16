import { CheckCircle2, Circle, Inbox } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerApi } from "@/lib/trpc/server";

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-md text-muted-foreground">{children}</p>
    </div>
  );
}

/** "What do I need to do now?" for each role (CONSTITUTION §7.3). */
export default async function TodayPage() {
  const t = await getTranslations("today");
  const api = await getServerApi();
  const me = await api.session.me();
  const title = <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>;

  if (!me.activeSchoolId) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p>{me.platformRole ? t("platformHint") : t("emptyBody")}</p>
            {me.platformRole ? (
              <Button asChild>
                <Link href="/platform/schools">{t("openSchools")}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const [home, setup] = await Promise.all([api.home.summary(), api.setup.get().catch(() => null)]);
  const roles = me.schools.find((school) => school.id === me.activeSchoolId)?.roles ?? [];
  const isAdmin = roles.includes("school_admin");

  const steps = setup
    ? [
        { key: "session", done: setup.sessions.length > 0, href: "/setup/sessions" },
        {
          key: "classes",
          done: setup.classes.some((c) => c.sections.length > 0),
          href: "/setup/classes",
        },
        { key: "students", done: (home.counts?.students ?? 0) > 0, href: "/people/students" },
        { key: "teachers", done: (home.counts?.teachers ?? 0) > 0, href: "/people/staff" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {title}

      {isAdmin && steps.some((s) => !s.done) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("checklistTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1">
              {steps.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="flex min-h-10 items-center gap-3 rounded-md px-2 hover:bg-muted"
                  >
                    {step.done ? (
                      <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span
                      className={step.done ? "text-muted-foreground line-through" : "font-medium"}
                    >
                      {t(`step.${step.key}` as "step.session")}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {home.counts ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("counts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4 text-center">
              {(["students", "teachers", "classes"] as const).map((key) => (
                <div key={key}>
                  <dd className="text-3xl font-semibold text-primary">{home.counts?.[key]}</dd>
                  <dt className="text-sm text-muted-foreground">{t(key)}</dt>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {roles.includes("teacher") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("myClasses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {home.mySections.length === 0 ? (
              <Empty>{t("noClasses")}</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {home.mySections.map((section) => (
                  <li key={section.sectionId} className="rounded-md border border-border px-3 py-2">
                    <p className="font-medium">{section.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {[section.isClassTeacher ? t("classTeacher") : null, ...section.subjects]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {roles.includes("parent") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("myChildren")}</CardTitle>
          </CardHeader>
          <CardContent>
            {home.children.length === 0 ? (
              <Empty>{t("noChildren")}</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {home.children.map((child) => (
                  <li key={child.id} className="rounded-md border border-border px-3 py-2">
                    <p className="font-medium">{child.fullName}</p>
                    {child.label ? (
                      <p className="text-sm text-muted-foreground">{child.label}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {home.me ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("myClass")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{home.me.fullName}</p>
            {home.me.label ? (
              <p className="text-sm text-muted-foreground">{home.me.label}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!home.counts && !roles.some((r) => ["teacher", "parent", "student"].includes(r)) ? (
        <Card>
          <CardContent>
            <Empty>{t("emptyBody")}</Empty>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
