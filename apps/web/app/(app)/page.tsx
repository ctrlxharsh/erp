import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  LayoutGrid,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { ToneIcon } from "@/components/ui/tone-icon";
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
  const title = <PageHeader title={t("title")} />;

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
          <CardHeader className="flex-row items-center gap-3">
            <ToneIcon icon={ClipboardCheck} tone="saffron" />
            <CardTitle>{t("checklistTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1">
              {steps.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={GraduationCap}
            tone="teal"
            label={t("students")}
            value={home.counts.students}
          />
          <StatTile icon={Users} tone="navy" label={t("teachers")} value={home.counts.teachers} />
          <StatTile
            icon={LayoutGrid}
            tone="slate"
            label={t("classes")}
            value={home.counts.classes}
          />
        </div>
      ) : null}

      {roles.includes("teacher") ? (
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <ToneIcon icon={School} tone="teal" />
            <CardTitle>{t("myClasses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {home.mySections.length === 0 ? (
              <Empty>{t("noClasses")}</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {home.mySections.map((section) => (
                  <li
                    key={section.sectionId}
                    className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-border px-3 py-2"
                  >
                    <p className="truncate font-medium">{section.label}</p>
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
          <CardHeader className="flex-row items-center gap-3">
            <ToneIcon icon={Users} tone="teal" />
            <CardTitle>{t("myChildren")}</CardTitle>
          </CardHeader>
          <CardContent>
            {home.children.length === 0 ? (
              <Empty>{t("noChildren")}</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {home.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/attendance/student/${child.id}`}
                      className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-border px-3 py-2 hover:bg-muted"
                    >
                      <p className="truncate font-medium">{child.fullName}</p>
                      {child.label ? (
                        <p className="text-sm text-muted-foreground">{child.label}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {home.me ? (
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <ToneIcon icon={School} tone="teal" />
            <CardTitle>{t("myClass")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href="/attendance/student/me"
              className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <p className="truncate font-medium">{home.me.fullName}</p>
              {home.me.label ? (
                <p className="text-sm text-muted-foreground">{home.me.label}</p>
              ) : null}
            </Link>
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
