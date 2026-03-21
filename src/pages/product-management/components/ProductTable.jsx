import React, { useState } from "react";
import Image from "components/AppImage";
import Icon from "components/AppIcon";
import { SkeletonTableRow } from "../../../components/ui/Skeleton";
import EmptyState from "../../../components/ui/EmptyState";
import { formatCLP } from "../../../utils/formatCLP";

const SORT_FIELDS = {
  name: "nombre",
  price: "precio",
  category: "categoría",
  status: "estado",
};

export default function ProductTable({
  products,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onToggleStatus,
  onEdit,
  onDuplicate,
  onDeleteRequest,
  sortField,
  sortDir,
  onSort,
  loading,
}) {
  const allSelected = products?.length > 0 && products?.every((p) => selectedIds?.includes(p?.id));
  const someSelected = products?.some((p) => selectedIds?.includes(p?.id)) && !allSelected;

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <Icon name="ChevronsUpDown" size={14} color="var(--color-muted-foreground)" />;
    return sortDir === "asc"
      ? <Icon name="ChevronUp" size={14} color="var(--color-primary)" />
      : <Icon name="ChevronDown" size={14} color="var(--color-primary)" />;
  };

  const ThBtn = ({ field, children }) => (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors focus:outline-none"
      style={{ fontFamily: "var(--font-caption)" }}
    >
      {children}
      <SortIcon field={field} />
    </button>
  );

  if (loading) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "var(--color-card)", borderColor: 'var(--color-border)' }}>
        {[...Array(5)]?.map((_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
    );
  }

  if (products?.length === 0) {
    return (
      <div className="rounded-xl border" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
        <EmptyState
          illustration="search"
          title="Sin resultados"
          description="No encontramos productos con los filtros actuales. Intenta ajustar tu búsqueda."
        />
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table: outer wrapper constrains width so overflow-x-auto scrolls inside, avoiding page overflow on mobile/tablet */}
      <div className="hidden md:block w-full max-w-full min-w-0 rounded-xl border overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="overflow-x-auto min-w-0 overflow-x-touch">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={(e) => onSelectAll(e?.target?.checked)} className="w-4 h-4 rounded border-input accent-primary cursor-pointer" aria-label="Seleccionar todos" />
                </th>
                <th className="px-4 py-3 text-left w-16"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Imagen</span></th>
                <th className="px-3 py-3 text-left w-[88px]"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Código</span></th>
                <th className="px-4 py-3 text-left"><ThBtn field="name">Nombre</ThBtn></th>
                <th className="px-4 py-3 text-left"><ThBtn field="category">Categoría</ThBtn></th>
                <th className="px-4 py-3 text-right"><ThBtn field="price">Precio</ThBtn></th>
                <th className="px-4 py-3 text-center"><ThBtn field="status">Estado</ThBtn></th>
                <th className="px-4 py-3 text-right"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {products?.map((product) => (
                <tr key={product?.id} className={`border-b last:border-0 transition-colors hover:bg-muted/50 ${selectedIds?.includes(product?.id) ? 'bg-violet-50' : ''}`} style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds?.includes(product?.id)} onChange={(e) => onSelectOne(product?.id, e?.target?.checked)} className="w-4 h-4 rounded border-input accent-primary cursor-pointer" aria-label={`Seleccionar ${product?.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-11 h-11 rounded-xl overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
                      <Image src={product?.image} alt={product?.imageAlt} className="w-full h-full object-cover" width={44} height={44} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-semibold tracking-wide whitespace-nowrap" style={{ fontFamily: 'var(--font-data)', color: 'var(--color-muted-foreground)' }} title="Código WhatsApp">
                      {product?.publicCode || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold line-clamp-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>{product?.name}</p>
                    <p className="text-xs line-clamp-1 mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{product?.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{product?.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-data)' }}>{formatCLP(product?.price)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onToggleStatus(product?.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${product?.active ? '' : ''}`}
                      style={{ backgroundColor: product?.active ? 'var(--color-primary)' : 'var(--color-border)' }}
                      role="switch" aria-checked={product?.active} aria-label={`${product?.active ? 'Desactivar' : 'Activar'} ${product?.name}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${product?.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onEdit(product?.id)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-muted focus:outline-none" title="Editar" aria-label={`Editar ${product?.name}`}>
                        <Icon name="Pencil" size={14} color="var(--color-muted-foreground)" />
                      </button>
                      <button onClick={() => onDuplicate(product?.id)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-muted focus:outline-none" title="Duplicar" aria-label={`Duplicar ${product?.name}`}>
                        <Icon name="Copy" size={14} color="var(--color-muted-foreground)" />
                      </button>
                      <button onClick={() => onDeleteRequest(product?.id)} className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-red-50 focus:outline-none" title="Eliminar" aria-label={`Eliminar ${product?.name}`}>
                        <Icon name="Trash2" size={14} color="var(--color-destructive)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {products?.map((product) => (
          <div
            key={product?.id}
            className={`rounded-lg border border-border p-4 transition-all ${selectedIds?.includes(product?.id) ? "border-primary/40 bg-primary/5" : ""}`}
            style={{ backgroundColor: "var(--color-card)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds?.includes(product?.id)}
                onChange={(e) => onSelectOne(product?.id, e?.target?.checked)}
                className="w-4 h-4 mt-1 rounded border-border accent-primary cursor-pointer flex-shrink-0"
                aria-label={`Seleccionar ${product?.name}`}
              />
              <div className="w-16 h-16 rounded-md overflow-hidden border border-border flex-shrink-0">
                <Image
                  src={product?.image}
                  alt={product?.imageAlt}
                  className="w-full h-full object-cover"
                  width={64}
                  height={64}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground line-clamp-1" style={{ fontFamily: "var(--font-body)" }}>
                      {product?.name}
                    </p>
                    {product?.publicCode ? (
                      <p className="text-[11px] font-semibold tracking-wider mt-0.5" style={{ fontFamily: "var(--font-data)", color: "var(--color-muted-foreground)" }}>
                        {product.publicCode}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5" style={{ fontFamily: "var(--font-caption)" }}>
                      {product?.description}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleStatus(product?.id)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${product?.active ? "bg-secondary" : "bg-muted"}`}
                    role="switch"
                    aria-checked={product?.active}
                    aria-label={`${product?.active ? "Desactivar" : "Activar"} ${product?.name}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${product?.active ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-data)" }}>
                      {formatCLP(product?.price)}
                    </span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: "var(--color-muted)", color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}
                    >
                      {product?.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(product?.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                      aria-label={`Editar ${product?.name}`}
                    >
                      <Icon name="Pencil" size={15} color="currentColor" />
                    </button>
                    <button
                      onClick={() => onDuplicate(product?.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                      aria-label={`Duplicar ${product?.name}`}
                    >
                      <Icon name="Copy" size={15} color="currentColor" />
                    </button>
                    <button
                      onClick={() => onDeleteRequest(product?.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      aria-label={`Eliminar ${product?.name}`}
                    >
                      <Icon name="Trash2" size={15} color="currentColor" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}