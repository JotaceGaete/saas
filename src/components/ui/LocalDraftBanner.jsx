import React from 'react';

export default function LocalDraftBanner({ visible, alreadyRestored = false, onRestore, onDismiss, onDelete }) {
  if (!visible) return null;
  return (
    <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'rgba(217,119,6,0.35)', backgroundColor: 'rgba(217,119,6,0.08)' }}>
      <p className="text-sm font-medium" style={{ color: '#92400E', fontFamily: 'var(--font-caption)' }}>
        {alreadyRestored ? 'Borrador local restaurado.' : 'Hay cambios sin guardar recuperados de una sesión anterior.'}
      </p>
      <div className="flex flex-shrink-0 items-center gap-2">
        {!alreadyRestored && <button type="button" onClick={onRestore} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: '#059669' }}>Restaurar</button>}
        <button type="button" onClick={onDismiss} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'rgba(146,64,14,0.3)', color: '#92400E' }}>Ahora no</button>
        <button type="button" onClick={onDelete} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: '#dc2626' }}>Descartar borrador</button>
      </div>
    </div>
  );
}
