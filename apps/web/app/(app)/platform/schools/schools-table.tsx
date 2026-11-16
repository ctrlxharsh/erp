"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ERPDataTable } from "@/components/erp-data-table";
import { type Status, StatusBadge } from "@/components/ui/status-badge";
import { useTRPC } from "@/lib/trpc/client";

interface Row {
  id: string;
  name: string;
  status: "active" | "grace" | "expired" | "suspended" | "deleted";
  createdAt: string | Date;
  adminCount: number;
}

const statusView: Record<Row["status"], Status> = {
  active: "approved",
  grace: "late",
  expired: "rejected",
  suspended: "rejected",
  deleted: "rejected",
};

const pageSize = 10;

export function SchoolsTable() {
  const t = useTranslations("platform");
  const tt = useTranslations("table");
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const sort = sorting[0];
  const query = useQuery(
    trpc.platform.listSchools.queryOptions({
      page,
      pageSize,
      search,
      sort: sort?.id === "name" ? "name" : "createdAt",
      direction: sort?.desc === false ? "asc" : "desc",
    }),
  );

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("name"),
        cell: ({ row }) => (
          <Link
            href={`/platform/schools/${row.original.id}`}
            className="font-medium text-primary underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => {
          const label =
            row.original.status === "suspended" ? t("suspendedStatus") : t(row.original.status);
          return <StatusBadge status={statusView[row.original.status]} label={label} />;
        },
      },
      { accessorKey: "adminCount", header: t("admins"), enableSorting: false },
      {
        accessorKey: "createdAt",
        header: t("createdOn"),
        cell: ({ row }) =>
          new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeZone: "Asia/Kolkata",
          }).format(new Date(row.original.createdAt)),
      },
    ],
    [t],
  );

  return (
    <ERPDataTable
      label={t("schoolsTitle")}
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
  );
}
