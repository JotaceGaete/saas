import React, { useState, useRef, useEffect } from "react";
import Icon from "components/AppIcon";

const BULK_ACTIONS = [
  { key: 'show',         label: 'Mostrar en catálogo',  icon: 'Eye' },
  { key: 'hide',         label: 'Ocultar del catálogo', icon: 'EyeOff' },
  null,
  { key: 'available',    label: 'Marcar disponible',    icon: 'CheckCircle' },
  { key: 'sold_out',     label: 'Marcar agotado',       icon: 'Package' },
  null,
  { key: 'featured_on',  label: 'Destacar',             icon: 'Star' },
  { key: 'featured_off', label: 'Quitar destacado',     icon: 'StarOff' },
  null,
  { key: 'sale_on',      label: 'Poner en oferta',      icon: 'Tag' },
  { key: 'sale_off',     label: 'Quitar oferta',        icon: 'TagX' },
];

export default function BulkActionBar({ selectedCount, onBulkAction, onDelete, onDeselect }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border border-border shadow-xl"
      style={{
        backgroundColor: "var(--color-card)",
        boxShadow: "0 20px 48px rgba(15,23,42,0.18)",
        minWidth: "320px",
      }}
    >
      {/* Counter */}
      <div className="flex items-center gap-2 mr-1 shrink-0">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: "var(--color-primary)", color: "#fff", fontFamily: "var(--font-data)" }}
        >
          {selectedCount}
        </div>
        <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--color-foreground)", fontFamily: "var(--font-caption)" }}>
          seleccionado{selectedCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* Bulk actions dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          <Icon name="SlidersHorizontal" size={13} color="currentColor" />
          Acción masiva
          <Icon name="ChevronUp" size={12} color="currentColor" />
        </button>
        {open && (
          <div
            className="absolute bottom-full mb-2 left-0 w-52 rounded-xl border bg-white p-1.5 shadow-xl"
            style={{ borderColor: 'var(--color-border)', boxShadow: '0 20px 48px rgba(15,23,42,0.18)' }}
          >
            {BULK_ACTIONS.map((action, i) =>
              action === null ? (
                <div key={`sep-${i}`} className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
              ) : (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => { setOpen(false); onBulkAction(action.key); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50"
                  style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name={action.icon} size={13} color="currentColor" />
                  {action.label}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-rose-50"
        style={{ borderColor: 'rgba(244,63,94,0.3)', color: '#e11d48', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name="Trash2" size={13} color="currentColor" />
        Eliminar
      </button>

      {/* Deselect */}
      <button
        type="button"
        onClick={onDeselect}
        className="w-7 h-7 flex items-center justify-center rounded-md transition-all hover:bg-slate-100"
        style={{ color: 'var(--color-muted-foreground)' }}
        aria-label="Cancelar selección"
      >
        <Icon name="X" size={14} color="currentColor" />
      </button>
    </div>
  );
}
