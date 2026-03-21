import React from "react";
import Icon from "components/AppIcon";

import Button from "components/ui/Button";

const statusOptions = [
  { value: "all", label: "Todos los estados" },
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
];

const categoryOptions = [
  { value: "all", label: "Todas las categorías" },
  { value: "food", label: "Alimentos" },
  { value: "drinks", label: "Bebidas" },
  { value: "clothing", label: "Ropa" },
  { value: "accessories", label: "Accesorios" },
  { value: "home", label: "Hogar" },
  { value: "beauty", label: "Belleza" },
];

export default function ProductFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  resultsCount,
  onClearFilters,
}) {
  const hasActiveFilters =
    searchQuery ||
    statusFilter !== "all" ||
    categoryFilter !== "all";

  return (
    <div
      className="rounded-lg border border-border p-4 mb-4"
      style={{ backgroundColor: "var(--color-card)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex flex-col gap-3">
        {/* Top row: search + add button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <Icon name="Search" size={16} color="var(--color-muted-foreground)" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, descripción o código..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e?.target?.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Category */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground" style={{ fontFamily: "var(--font-caption)" }}>
              Categoría
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryChange(e?.target?.value)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {categoryOptions?.map((opt) => (
                <option key={opt?.value} value={opt?.value}>{opt?.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground" style={{ fontFamily: "var(--font-caption)" }}>
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusChange(e?.target?.value)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {statusOptions?.map((opt) => (
                <option key={opt?.value} value={opt?.value}>{opt?.label}</option>
              ))}
            </select>
          </div>

          {/* Results + clear */}
          <div className="flex items-end gap-2 ml-auto">
            <span
              className="text-sm text-muted-foreground whitespace-nowrap py-2"
              style={{ fontFamily: "var(--font-caption)" }}
            >
              {resultsCount} resultado{resultsCount !== 1 ? "s" : ""}
            </span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={onClearFilters} iconName="X" iconPosition="left" iconSize={14}>
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}