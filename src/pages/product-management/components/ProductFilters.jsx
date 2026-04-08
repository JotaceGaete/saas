import React from "react";
import { Search } from "lucide-react";
import Button from "components/ui/Button";

export const statusFilterOptions = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Inactivos" },
];

export default function ProductFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  resultsCount = 0,
  onClearFilters,
}) {
  const hasActiveFilters = Boolean(searchQuery?.trim()) || statusFilter !== "all";

  const badgeClass = (active) =>
    [
      "inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
      "font-[family-name:var(--font-caption)] border",
      active
        ? "border-violet-200 bg-violet-50 text-violet-800 shadow-sm shadow-violet-500/10"
        : "border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/80",
    ].join(" ");

  return (
    <div className="mb-5 space-y-4">
      {/* Search */}
      <div className="relative w-full max-w-2xl">
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400">
          <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <input
          type="search"
          placeholder="Buscar por nombre, descripción o código..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e?.target?.value)}
          className="w-full rounded-full border border-slate-200/90 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm shadow-slate-200/30 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10 font-[family-name:var(--font-body)]"
        />
      </div>

      {/* Status filter + results count */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 font-[family-name:var(--font-caption)]">
            Estado
          </span>
          <div className="flex flex-wrap gap-2">
            {statusFilterOptions?.map((opt) => (
              <button
                key={opt?.value}
                type="button"
                onClick={() => onStatusChange(opt?.value)}
                className={badgeClass(statusFilter === opt?.value)}
              >
                {opt?.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pb-0.5">
          <span className="text-sm text-slate-500 whitespace-nowrap font-[family-name:var(--font-caption)]">
            {resultsCount} resultado{resultsCount !== 1 ? "s" : ""}
          </span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-slate-600 hover:text-slate-900"
              iconName="X"
              iconPosition="left"
              iconSize={14}
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
