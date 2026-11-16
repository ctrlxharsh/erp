import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Status, StatusBadge, statusStyles } from "@/components/ui/status-badge";
import { DemoTable } from "./demo-table";

export const metadata: Metadata = { title: "Components" };

export default async function DesignPage() {
  const t = await getTranslations("status");
  const statuses = Object.keys(statusStyles) as Status[];
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-primary">Components</h1>
      <p className="text-muted-foreground">
        Reference page for the shared building blocks. Uses made-up sample data only.
      </p>

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
