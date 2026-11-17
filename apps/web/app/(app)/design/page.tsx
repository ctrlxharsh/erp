import { BookOpen, GraduationCap, LayoutGrid, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatTile } from "@/components/ui/stat-tile";
import { type Status, StatusBadge, statusStyles } from "@/components/ui/status-badge";
import { type Tone, toneClasses } from "@/components/ui/tone";
import { ToneIcon } from "@/components/ui/tone-icon";
import { DemoTable } from "./demo-table";

export const metadata: Metadata = { title: "Components" };

const tones: { tone: Tone; name: string; icon: typeof Users }[] = [
  { tone: "navy", name: "Navy", icon: GraduationCap },
  { tone: "teal", name: "Teal", icon: Users },
  { tone: "saffron", name: "Saffron", icon: BookOpen },
  { tone: "coral", name: "Coral", icon: Wallet },
  { tone: "slate", name: "Slate", icon: LayoutGrid },
];

export default async function DesignPage() {
  const t = await getTranslations("status");
  const statuses = Object.keys(statusStyles) as Status[];
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Components"
        description="Reference page for the shared building blocks. Uses made-up sample data only."
      />

      <Card>
        <CardHeader>
          <CardTitle>Module tones</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {tones.map(({ tone, name, icon }) => (
            <div key={tone} className="flex min-w-0 flex-col items-start gap-2">
              <ToneIcon icon={icon} tone={tone} />
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
                {tone}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tone icon sizes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <ToneIcon icon={Users} tone="teal" size="sm" />
            <span className="text-sm">Small</span>
          </div>
          <div className="flex items-center gap-2">
            <ToneIcon icon={Users} tone="teal" size="md" />
            <span className="text-sm">Medium</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stat tiles and progress</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile icon={GraduationCap} tone="teal" label="Class 6 A students" value={32} />
            <StatTile
              icon={Wallet}
              tone="coral"
              label="Fees collected"
              value={18}
              total={32}
              hint="Sample figures"
            />
          </div>
          <ProgressBar value={24} total={32} tone="navy" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page header with actions</CardTitle>
        </CardHeader>
        <CardContent>
          <PageHeader
            title="Class 6 A"
            description="Sample description for the page"
            actions={
              <>
                <Button variant="outline">Download template</Button>
                <Button>Add student</Button>
              </>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>Save attendance</Button>
          <Button variant="secondary">Download template</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Reverse payment</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statuses</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {statuses.map((status) => (
            <StatusBadge key={status} status={status} label={t(status)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form field</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="sample-name">Student name</Label>
          <Input id="sample-name" placeholder="Enter the full name" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>List (ERPDataTable)</CardTitle>
        </CardHeader>
        <CardContent>
          <DemoTable />
        </CardContent>
      </Card>
    </div>
  );
}
