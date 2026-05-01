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

export default function ProductTable({
  products,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onChangeStatus,
  onEdit,
  onDuplicate,
  onDeleteRequest,
  sortField,
  sortDir,
  onSort,
  loading,
  formatPrice,
}) {
  const allSelected = products?.length > 0 && products?.every((p) => selectedIds?.includes(p?.id));
  const someSelected = products?.some((p) => selectedIds?.includes(p?.id)) && !allSelected;
  const [openStatusMenuId, setOpenStatusMenuId] = useState(null);

  const getCommercialState = (product) => {
    if (product?.active === false) return { key: 'hidden', label: 'Oculto', bg: '#F1F5F9', color: '#64748B' };
    if (product?.isSoldOut === true) return { key: 'sold_out', label: 'Agotado', bg: '#FFF7ED', color: '#C2410C' };
    return { key: 'available', label: 'Disponible', bg: '#ECFDF5', color: '#059669' };
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
      {/* Desktop Table: reserved for xl+ so square/intermediate layouts switch to cards earlier. */}
      <div className="hidden xl:block w-full max-w-full min-w-0 rounded-xl border overflow-hidden" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1120px]">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
                <th className="w-10 px-4 py-4">
                  <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected; }} onChange={(e) => onSelectAll(e?.target?.checked)} className="w-4 h-4 rounded border-input accent-primary cursor-pointer" aria-label="Seleccionar todos" />
                </th>
                <th className="px-4 py-4 text-left w-16"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Imagen</span></th>
                <th className="px-3 py-4 text-left w-[88px]"><span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Código</span></th>
                <th className="px-4 py-4 text-left"><ThBtn field="name">Nombre</ThBtn></th>
                <th className="px-4 py-4 text-left"><ThBtn field="category">Categoría</ThBtn></th>
                <th className="px-4 py-4 text-right"><ThBtn field="price">Precio</ThBtn></th>
                <th className="px-4 py-4 text-center"><ThBtn field="status">Estado de venta</ThBtn></th>
                <th className="w-[280px] px-4 py-4 text-right"><span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Acciones</span></th>
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
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: commercialState.bg, color: commercialState.color, fontFamily: 'var(--font-caption)' }}
                    >
                      {commercialState.label}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="relative flex items-center justify-end gap-3 pl-2 whitespace-nowrap">
                      <div className="relative">
                        <button
                          onClick={() => setOpenStatusMenuId((prev) => prev === product?.id ? null : product?.id)}
                          className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                          aria-label={`Cambiar estado de ${product?.name}`}
                        >
                          Cambiar estado
                          <Icon name="ChevronDown" size={13} color="currentColor" />
                        </button>
                        {isStatusMenuOpen && (
                          <div
                            className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border bg-white p-1.5 shadow-lg"
                            style={{ borderColor: 'var(--color-border)', boxShadow: '0 18px 40px rgba(15,23,42,0.14)' }}
                          >
                            {[
                              { key: 'available', label: 'Marcar disponible' },
                              { key: 'sold_out', label: 'Marcar agotado' },
                              { key: 'hidden', label: 'Ocultar del catálogo' },
                            ].map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => {
                                  setOpenStatusMenuId(null);
                                  onChangeStatus(product?.id, option.key);
                                }}
                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                                style={{ color: commercialState.key === option.key ? 'var(--color-primary)' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => onEdit(product?.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/80"
                        title="Editar"
                        aria-label={`Editar ${product?.name}`}
                      >
                        <Icon name="Pencil" size={15} color="currentColor" />
                      </button>
                      <button
                        onClick={() => onDuplicate(product?.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/80"
                        title="Duplicar"
                        aria-label={`Duplicar ${product?.name}`}
                      >
                        <Icon name="Copy" size={15} color="currentColor" />
                      </button>
                      <button
                        onClick={() => onDeleteRequest(product?.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-rose-500 transition-all hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
                        title="Eliminar"
                        aria-label={`Eliminar ${product?.name}`}
                      >
                        <Icon name="Trash2" size={15} color="currentColor" />
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
      <div className="xl:hidden space-y-3">
        {products?.map((product) => {
          const commercialState = getCommercialState(product);
          const isStatusMenuOpen = openStatusMenuId === product?.id;
          return (
          <div
            key={product?.id}
            className={`rounded-xl border p-4 transition-all ${
              selectedIds?.includes(product?.id)
                ? "border-primary/40 bg-primary/5"
                : "border-slate-200/90 hover:bg-slate-50/50"
            }`}
            style={{ backgroundColor: "var(--color-card)", boxShadow: "var(--shadow-sm)" }}
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
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 shadow-sm shadow-slate-200/30">
                  <Image
                    src={product?.image}
                    alt={product?.imageAlt}
                    className="w-full h-full object-cover"
                    width={64}
                    height={64}
                  />
                </div>
                <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground line-clamp-1" style={{ fontFamily: "var(--font-body)" }}>
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
                  </div>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: commercialState.bg, color: commercialState.color, fontFamily: 'var(--font-caption)' }}
                  >
                    {commercialState.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-y-2 min-w-0">
                <span className="text-xl font-bold leading-none" style={{ fontFamily: "var(--font-data)", color: "var(--color-primary)" }}>
                  {formatPrice(product?.price)}
                </span>
                {product?.category ? (
                  <span
                    className="inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs"
                    style={{ backgroundColor: "var(--color-muted)", color: "var(--color-muted-foreground)", fontFamily: "var(--font-caption)" }}
                  >
                    {product?.category}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-y-3 min-w-0">
                <div className="relative min-w-0">
                  <button
                    onClick={() => setOpenStatusMenuId((prev) => prev === product?.id ? null : product?.id)}
                    className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50 h-10"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
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
                      {[
                        { key: 'available', label: 'Marcar disponible' },
                        { key: 'sold_out', label: 'Marcar agotado' },
                        { key: 'hidden', label: 'Ocultar del catálogo' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setOpenStatusMenuId(null);
                            onChangeStatus(product?.id, option.key);
                          }}
                          className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                          style={{ color: commercialState.key === option.key ? 'var(--color-primary)' : 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 min-w-0">
                  <button
                    onClick={() => onEdit(product?.id)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                    style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                    aria-label={`Editar ${product?.name}`}
                  >
                    <Icon name="Pencil" size={15} color="currentColor" />
                    Editar
                  </button>
                  <button
                    onClick={() => onDeleteRequest(product?.id)}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-50 hover:text-rose-700"
                    style={{ borderColor: 'rgba(244,63,94,0.24)', fontFamily: 'var(--font-caption)' }}
                    aria-label={`Eliminar ${product?.name}`}
                  >
                    <Icon name="Trash2" size={15} color="currentColor" />
                    Eliminar
                  </button>
                </div>

                <button
                  onClick={() => onDuplicate(product?.id)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                  aria-label={`Duplicar ${product?.name}`}
                >
                  <Icon name="Copy" size={15} color="currentColor" />
                  Duplicar
                </button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}
