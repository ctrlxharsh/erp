"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ERPDataTable } from "@/components/erp-data-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";
import { usePermissions } from "@/lib/use-permissions";

interface Row {
  id: string;
  admissionNo: string;
  fullName: string;
  className: string | null;
  sectionName: string | null;
  status: "active" | "left";
}

const pageSize = 10;

export function StudentsTable() {
  const t = useTranslations("people");
  const tt = useTranslations("table");
  const trpc = useTRPC();
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "fullName", desc: false }]);

  const setup = useQuery(trpc.setup.get.queryOptions());
  const sort = sorting[0];
  const query = useQuery(
    trpc.people.students.list.queryOptions({
      page,
      pageSize,
      search,
      sectionId: sectionId || undefined,
      sort: sort?.id === "admissionNo" ? "admissionNo" : "name",
      direction: sort?.desc ? "desc" : "asc",
    }),
  );

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("name"),
        cell: ({ row }) => (
          <Link
            href={`/people/students/${row.original.id}`}
            className="font-medium text-primary underline"
          >
            {row.original.fullName}
          </Link>
        ),
      },
      { accessorKey: "admissionNo", header: t("admissionNo") },
      {
        id: "class",
        header: t("classSection"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.className
            ? `${row.original.className} ${row.original.sectionName}`
            : t("noSection"),
      },
      {
        accessorKey: "status",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status === "active" ? "approved" : "draft"}
            label={row.original.status === "active" ? t("active") : t("left")}
          />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("studentsTitle")}
        actions={
          <>
            {can("people.import") ? (
              <Button asChild variant="outline">
                <Link href="/people/import">{t("importStudents")}</Link>
              </Button>
            ) : null}
            {can("people.manage") ? (
              <Button asChild>
                <Link href="/people/students/new">{t("addStudent")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="max-w-xs">
        <Select
          aria-label={t("classSection")}
          value={sectionId}
          onChange={(event) => {
            setSectionId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("allSections")}</option>
          {setup.data?.classes.flatMap((c) =>
            c.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {c.name} {s.name}
              </option>
            )),
          )}
        </Select>
      </div>
      <ERPDataTable
        label={t("studentsTitle")}
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
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={query.isPending}
        error={query.isError ? tt("error") : null}
        onRetry={() => query.refetch()}
      />
    </div>
  );
}
