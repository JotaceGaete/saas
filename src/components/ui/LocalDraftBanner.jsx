import React from 'react';

export default function LocalDraftBanner({ visible, onRestore, onDismiss, onDelete }) {
  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: 'rgba(217,119,6,0.35)', backgroundColor: 'rgba(217,119,6,0.08)' }}
    >
      <p className="text-sm font-medium" style={{ color: '#92400E', fontFamily: 'var(--font-caption)' }}>
        Hay cambios sin guardar recuperados de una sesión anterior.
      </p>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#059669', fontFamily: 'var(--font-caption)' }}
        >
          Restaurar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ borderColor: 'rgba(146,64,14,0.3)', color: '#92400E', fontFamily: 'var(--font-caption)' }}
        >
          Ignorar
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ color: '#dc2626', fontFamily: 'var(--font-caption)' }}
        >
          Eliminar borrador
        </button>
      </div>
    </div>
  );
}
