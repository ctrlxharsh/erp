"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  Inbox,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface ERPDataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Total rows on the server (all pages). */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Accessible name for the table. */
  label: string;
}

/**
 * The one list component for the web app (CONSTITUTION §7.4). Search, sorting and pagination are
 * controlled by the caller so they run on the server; this component only renders and reports.
 */
export function ERPDataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  search,
  onSearchChange,
  sorting,
  onSortingChange,
  isLoading,
  error,
  onRetry,
  label,
}: ERPDataTableProps<T>) {
  const t = useTranslations("table");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
  });

  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              <Columns3 className="size-4" aria-hidden="true" />
              {t("columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table aria-label={label} aria-busy={isLoading} className="w-full text-left text-sm">
          <thead className="bg-surface">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const ariaSort =
                    sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
                  const SortIcon =
                    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={canSort ? ariaSort : undefined}
                      className="border-b border-border px-4 py-3 font-medium"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon className="size-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, row) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
                <tr key={row}>
                  <td colSpan={columnCount} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                    <span className="sr-only">{t("loading")}</span>
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center">
                  <AlertCircle className="mx-auto mb-2 size-6 text-danger" aria-hidden="true" />
                  <p className="font-medium">{t("error")}</p>
                  <p className="mb-3 text-muted-foreground">{error}</p>
                  {onRetry ? (
                    <Button variant="outline" onClick={onRetry}>
                      {t("retry")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center">
                  <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium">{t("empty")}</p>
                  <p className="text-muted-foreground">{t("emptyHint")}</p>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("total", { count: total })}</span>
        <div className="flex items-center gap-2">
          <span aria-live="polite">{t("pageOf", { page, pages })}</span>
          <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {t("previous")}
          </Button>
          <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            {t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
