import React, { useState } from "react";
import Image from "components/AppImage";
import Icon from "components/AppIcon";
import { SkeletonTableRow } from "../../../components/ui/Skeleton";
import EmptyState from "../../../components/ui/EmptyState";

const SORT_FIELDS = {
  name: "nombre",
  price: "precio",
  category: "categoría",
  status: "estado",
};

// Compact toggle chip for featured / onSale
function QuickToggle({ active, onIcon, offIcon, onLabel, offLabel, activeColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? offLabel : onLabel}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all hover:opacity-80"
      style={active
        ? { backgroundColor: `${activeColor}18`, borderColor: `${activeColor}40`, color: activeColor }
        : { backgroundColor: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }
      }
    >
      <Icon name={active ? onIcon : offIcon} size={11} color="currentColor" />
      {active ? onLabel : offLabel}
    </button>
  );
}

const STATUS_DROPDOWN_OPTIONS = [
  { key: 'available',    label: 'Disponible',       icon: 'CheckCircle' },
  { key: 'sold_out',     label: 'Agotado',           icon: 'Package' },
  { key: 'hidden',       label: 'Ocultar catálogo',  icon: 'EyeOff' },
  null, // separator
  { key: 'featured_on',  label: 'Destacar',          icon: 'Star' },
  { key: 'featured_off', label: 'Quitar destacado',  icon: 'StarOff' },
  null,
  { key: 'sale_on',      label: 'Poner en oferta',   icon: 'Tag' },
  { key: 'sale_off',     label: 'Quitar oferta',     icon: 'TagX' },
];

export default function ProductTable({
  products,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onChangeStatus,
  onToggleField,
  onEdit,
  onDuplicate,
  onDeleteRequest,
  sortField,
  sortDir,
  onSort,
  loading,
  formatPrice,
  hasProducts = true,
  emptyTitle = "Todavía no tienes productos",
  emptyDescription = "Agrega tu primer producto para empezar a vender.",
  filteredEmptyDescription = "No encontramos productos con los filtros actuales. Intenta ajustar tu búsqueda.",
}) {
  const allSelected = products?.length > 0 && products?.every((p) => selectedIds?.includes(p?.id));
  const someSelected = products?.some((p) => selectedIds?.includes(p?.id)) && !allSelected;
  const [openStatusMenuId, setOpenStatusMenuId] = useState(null);

  const getCommercialState = (product) => {
    if (product?.active === false) return { key: 'hidden', label: 'Oculto', bg: '#F8FAFC', color: '#64748B', border: 'rgba(100,116,139,0.18)' };
    if (product?.isSoldOut === true) return { key: 'sold_out', label: 'Agotado', bg: '#FFFBEB', color: '#B45309', border: 'rgba(180,83,9,0.18)' };
    return { key: 'available', label: 'Disponible', bg: '#F0FDF4', color: '#047857', border: 'rgba(4,120,87,0.16)' };
  };

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
      <div className="rounded-2xl border border-white/70 bg-white/62 shadow-[0_10px_28px_rgba(17,24,39,0.04)]">
        <EmptyState
          illustration={hasProducts ? "search" : "package"}
          title={hasProducts ? "Sin resultados" : emptyTitle}
          description={hasProducts ? filteredEmptyDescription : emptyDescription}
        />
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table: reserved for truly wide screens only. */}
      <div className="hidden 2xl:block w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-[0_12px_34px_rgba(17,24,39,0.055)]">
        <div className="min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1120px]">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'rgba(248,250,252,0.8)', borderColor: 'rgba(226,232,240,0.7)' }}>
                <th className="w-10 px-4 py-4">
                  <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={(e) => onSelectAll(e?.target?.checked)} className="w-4 h-4 rounded border-input accent-primary cursor-pointer" aria-label="Seleccionar todos" />
                </th>
                <th className="px-4 py-4 text-left w-16"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Imagen</span></th>
                <th className="px-3 py-4 text-left w-[88px]"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Código</span></th>
                <th className="px-4 py-4 text-left"><ThBtn field="name">Nombre</ThBtn></th>
                <th className="px-4 py-4 text-left"><ThBtn field="category">Categoría</ThBtn></th>
                <th className="px-4 py-4 text-right"><ThBtn field="price">Precio</ThBtn></th>
                <th className="px-4 py-4 text-center"><ThBtn field="status">Estado</ThBtn></th>
                <th className="px-4 py-4 text-center"><span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Extras</span></th>
                <th className="w-[240px] px-4 py-4 text-right"><span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {products?.map((product) => (
                (() => {
                  const commercialState = getCommercialState(product);
                  const isStatusMenuOpen = openStatusMenuId === product?.id;
                  return (
                <tr
                  key={product?.id}
                  className={`border-b last:border-0 transition-colors ${
                    selectedIds?.includes(product?.id)
                      ? "bg-violet-50 hover:bg-violet-100/60"
                      : "hover:bg-slate-50/50"
                  }`}
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-4">
                    <input type="checkbox" checked={selectedIds?.includes(product?.id)} onChange={(e) => onSelectOne(product?.id, e?.target?.checked)} className="w-4 h-4 rounded border-input accent-primary cursor-pointer" aria-label={`Seleccionar ${product?.name}`} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="w-11 h-11 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm shadow-slate-200/30">
                      <Image src={product?.image} alt={product?.imageAlt} className="w-full h-full object-cover" width={44} height={44} />
                    </div>
                  </td>
                  <td className="px-3 py-4">
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
                    <span className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-data)' }}>{formatPrice(product?.price)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: commercialState.bg, color: commercialState.color, borderColor: commercialState.border, fontFamily: 'var(--font-caption)' }}
                    >
                      {commercialState.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <QuickToggle
                        active={product?.featured}
                        onIcon="Star" offIcon="Star"
                        onLabel="Dest." offLabel="Dest."
                        activeColor="#f59e0b"
                        onClick={() => onToggleField(product?.id, 'featured', !product?.featured)}
                      />
                      <QuickToggle
                        active={product?.onSale}
                        onIcon="Tag" offIcon="Tag"
                        onLabel="Oferta" offLabel="Oferta"
                        activeColor="#8b5cf6"
                        onClick={() => onToggleField(product?.id, 'onSale', !product?.onSale)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="relative flex items-center justify-end gap-2 pl-2 whitespace-nowrap">
                      <div className="relative">
                        <button
                          onClick={() => setOpenStatusMenuId((prev) => prev === product?.id ? null : product?.id)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-50"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                          aria-label={`Cambiar estado de ${product?.name}`}
                        >
                          Estado
                          <Icon name="ChevronDown" size={12} color="currentColor" />
                        </button>
                        {isStatusMenuOpen && (
                          <div
                            className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-1.5 shadow-lg"
                            style={{ borderColor: 'var(--color-border)', boxShadow: '0 18px 40px rgba(15,23,42,0.14)' }}
                          >
                            {STATUS_DROPDOWN_OPTIONS.map((option, i) =>
                              option === null ? (
                                <div key={`sep-${i}`} className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                              ) : (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => { setOpenStatusMenuId(null); onChangeStatus(product?.id, option.key); }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                                  style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                >
                                  <Icon name={option.icon} size={12} color="currentColor" />
                                  {option.label}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => onEdit(product?.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 focus:outline-none"
                        title="Editar"
                        aria-label={`Editar ${product?.name}`}
                      >
                        <Icon name="Pencil" size={14} color="currentColor" />
                      </button>
                      <button
                        onClick={() => onDuplicate(product?.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 focus:outline-none"
                        title="Duplicar"
                        aria-label={`Duplicar ${product?.name}`}
                      >
                        <Icon name="Copy" size={14} color="currentColor" />
                      </button>
                      <button
                        onClick={() => onDeleteRequest(product?.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-rose-500 transition-all hover:bg-rose-50 hover:text-rose-600 focus:outline-none"
                        title="Eliminar"
                        aria-label={`Eliminar ${product?.name}`}
                      >
                        <Icon name="Trash2" size={14} color="currentColor" />
                      </button>
                    </div>
                  </td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Card Layout for mobile, tablets and intermediate widths */}
      <div className="2xl:hidden space-y-3">
        {products?.map((product) => {
          const commercialState = getCommercialState(product);
          const isStatusMenuOpen = openStatusMenuId === product?.id;
          return (
          <div
            key={product?.id}
            className={`rounded-2xl border p-3.5 transition-all duration-150 sm:p-4 ${
              selectedIds?.includes(product?.id)
                ? "border-slate-950/30 bg-white"
                : "border-white/70 hover:-translate-y-0.5 hover:bg-white/80"
            }`}
            style={{ backgroundColor: "rgba(255,255,255,0.68)", boxShadow: "0 10px 26px rgba(17,24,39,0.045)" }}
          >
            <div className="flex flex-col gap-y-3 min-w-0">
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds?.includes(product?.id)}
                  onChange={(e) => onSelectOne(product?.id, e?.target?.checked)}
                  className="w-4 h-4 mt-1 rounded border-border accent-primary cursor-pointer flex-shrink-0"
                  aria-label={`Seleccionar ${product?.name}`}
                />
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-white bg-slate-100 shadow-sm shadow-slate-200/40">
                  <Image
                    src={product?.image}
                    alt={product?.imageAlt}
                    className="w-full h-full object-cover"
                    width={64}
                    height={64}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-slate-950 line-clamp-1" style={{ fontFamily: "var(--font-heading)" }}>
                        {product?.name}
                      </p>
                      {product?.publicCode ? (
                        <p className="text-[11px] font-semibold tracking-wider mt-0.5" style={{ fontFamily: "var(--font-data)", color: "var(--color-muted-foreground)" }}>
                          {product.publicCode}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1" style={{ fontFamily: "var(--font-caption)" }}>
                        {product?.description}
                      </p>
                      {product?.category ? (
                        <span
                          className="mt-2 inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs"
                          style={{ backgroundColor: "var(--color-muted)", color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}
                        >
                          {product?.category}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:min-w-[150px] sm:flex-col sm:items-end sm:justify-start">
                      <span className="text-xl font-black leading-none whitespace-nowrap text-slate-950" style={{ fontFamily: "var(--font-data)" }}>
                        {formatPrice(product?.price)}
                      </span>
                      <span
                        className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ backgroundColor: commercialState.bg, color: commercialState.color, borderColor: commercialState.border, fontFamily: 'var(--font-caption)' }}
                      >
                        {commercialState.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-y-3 min-w-0">
                {/* Quick feature/sale toggles */}
                <div className="flex items-center gap-2">
                  <QuickToggle
                    active={product?.featured}
                    onIcon="Star" offIcon="Star"
                    onLabel="Destacado" offLabel="Destacado"
                    activeColor="#f59e0b"
                    onClick={() => onToggleField(product?.id, 'featured', !product?.featured)}
                  />
                  <QuickToggle
                    active={product?.onSale}
                    onIcon="Tag" offIcon="Tag"
                    onLabel="En oferta" offLabel="En oferta"
                    activeColor="#8b5cf6"
                    onClick={() => onToggleField(product?.id, 'onSale', !product?.onSale)}
                  />
                </div>
                <div className="relative min-w-0">
                  <button
                    onClick={() => setOpenStatusMenuId((prev) => prev === product?.id ? null : product?.id)}
                    className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-white"
                    style={{ borderColor: 'rgba(203,213,225,0.85)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                    aria-label={`Cambiar estado de ${product?.name}`}
                  >
                    <span className="truncate">Cambiar estado</span>
                    <Icon name="ChevronDown" size={13} color="currentColor" />
                  </button>
                  {isStatusMenuOpen && (
                    <div
                      className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border bg-white p-1.5 shadow-lg"
                      style={{ borderColor: 'var(--color-border)', boxShadow: '0 18px 40px rgba(15,23,42,0.14)' }}
                    >
                      {STATUS_DROPDOWN_OPTIONS.map((option, i) =>
                        option === null ? (
                          <div key={`sep-${i}`} className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                        ) : (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => { setOpenStatusMenuId(null); onChangeStatus(product?.id, option.key); }}
                            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                            style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                          >
                            <Icon name={option.icon} size={13} color="currentColor" />
                            {option.label}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    onClick={() => onEdit(product?.id)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold text-slate-800 transition-all hover:bg-white hover:text-slate-950 sm:min-w-[140px] sm:flex-1"
                    style={{ borderColor: 'rgba(203,213,225,0.85)', fontFamily: 'var(--font-caption)' }}
                    aria-label={`Editar ${product?.name}`}
                  >
                    <Icon name="Pencil" size={15} color="currentColor" />
                    Editar
                  </button>
                  <button
                    onClick={() => onDuplicate(product?.id)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition-all hover:bg-white hover:text-slate-800 sm:min-w-[140px] sm:flex-1"
                    style={{ fontFamily: 'var(--font-caption)' }}
                    aria-label={`Duplicar ${product?.name}`}
                  >
                    <Icon name="Copy" size={15} color="currentColor" />
                    Duplicar
                  </button>
                  <button
                    onClick={() => onDeleteRequest(product?.id)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-50 hover:text-rose-700 sm:min-w-[140px] sm:flex-1"
                    style={{ borderColor: 'rgba(244,63,94,0.24)', fontFamily: 'var(--font-caption)' }}
                    aria-label={`Eliminar ${product?.name}`}
                  >
                    <Icon name="Trash2" size={15} color="currentColor" />
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}
