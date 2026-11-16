"use client";

import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ERPDataTable } from "@/components/erp-data-table";
import { type Status, StatusBadge } from "@/components/ui/status-badge";

interface Row {
  id: number;
  name: string;
  className: string;
  status: Status;
}

// Fictional sample rows to show the table states. Not real data.
const sample: Row[] = Array.from({ length: 23 }, (_, index) => ({
  id: index + 1,
  name: `Student ${String(index + 1).padStart(2, "0")}`,
  className: `Class ${(index % 8) + 1}`,
  status: (["pending", "submitted", "late", "approved"] as const)[index % 4] as Status,
}));

const pageSize = 5;

export function DemoTable() {
  const t = useTranslations("status");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "className", header: "Class" },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} label={t(row.original.status)} />
        ),
      },
    ],
    [t],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term ? sample.filter((row) => row.name.toLowerCase().includes(term)) : [...sample];
    const sort = sorting[0];
    if (sort) {
      const key = sort.id as "name" | "className";
      rows.sort(
        (a, b) => a[key].localeCompare(b[key], "en", { numeric: true }) * (sort.desc ? -1 : 1),
      );
    }
    return rows;
  }, [search, sorting]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <ERPDataTable
      label="Sample students"
      columns={columns}
      data={pageRows}
      total={filtered.length}
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
    />
  );
}
