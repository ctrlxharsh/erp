"use client";

import { createStaffInputSchema } from "@erp/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ERPDataTable } from "@/components/erp-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

type Values = z.input<typeof createStaffInputSchema>;
interface Row {
  id: string;
  fullName: string;
  kind: "teacher" | "non_teaching";
  email: string | null;
  phone: string | null;
  status: "active" | "left";
  hasLogin: boolean;
}
const pageSize = 10;

export function StaffTable() {
  const t = useTranslations("people");
  const tt = useTranslations("table");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const query = useQuery(trpc.people.staff.list.queryOptions({ page, pageSize, search }));
  const create = useMutation(trpc.people.staff.create.mutationOptions());
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(createStaffInputSchema),
    mode: "onBlur",
    defaultValues: { kind: "teacher", fullName: "", email: "", phone: "" },
  });

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("name"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/people/staff/${row.original.id}`}
            className="font-medium text-primary underline"
          >
            {row.original.fullName}
          </Link>
        ),
      },
      {
        id: "kind",
        header: t("kind"),
        enableSorting: false,
        cell: ({ row }) => (row.original.kind === "teacher" ? t("teacher") : t("nonTeaching")),
      },
      {
        accessorKey: "email",
        header: t("email"),
        enableSorting: false,
        cell: ({ row }) => row.original.email ?? "—",
      },
      {
        id: "login",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.hasLogin ? "approved" : "pending"}
            label={row.original.hasLogin ? t("hasLogin") : t("noLogin")}
          />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-primary">{t("staffTitle")}</h1>
        {can("people.manage") ? (
          <Button onClick={() => setAdding((v) => !v)}>{t("addStaff")}</Button>
        ) : null}
      </div>
      {adding ? (
        <form
          noValidate
          className="flex max-w-md flex-col gap-3 rounded-md border border-border p-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await create.mutateAsync(values);
              reset();
              setAdding(false);
              await queryClient.invalidateQueries({ queryKey: trpc.people.staff.list.queryKey() });
              toast.success(t("staffSaved"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("importFailed"));
            }
          })}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-name">{t("fullName")}</Label>
            <Input
              id="s-name"
              aria-invalid={errors.fullName ? true : undefined}
              {...register("fullName")}
            />
            {errors.fullName ? (
              <p className="text-sm text-danger">{errors.fullName.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-kind">{t("kind")}</Label>
            <Select id="s-kind" {...register("kind")}>
              <option value="teacher">{t("teacher")}</option>
              <option value="non_teaching">{t("nonTeaching")}</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-email">{t("email")}</Label>
              <Input id="s-email" type="email" {...register("email")} />
              {errors.email ? <p className="text-sm text-danger">{errors.email.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-phone">{t("phone")}</Label>
              <Input id="s-phone" type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={create.isPending}>
              {t("saveStaff")}
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : null}
      <ERPDataTable
        label={t("staffTitle")}
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        sorting={[]}
        onSortingChange={() => undefined}
        isLoading={query.isPending}
        error={query.isError ? tt("error") : null}
        onRetry={() => query.refetch()}
      />
    </div>
  );
}
