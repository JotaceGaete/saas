import React from 'react';

/** Discreet "Guardando borrador…" / "Borrador guardado" text, driven by useLocalDraft's status. */
export default function DraftStatusIndicator({ status }) {
  if (status !== 'saving' && status !== 'saved') return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
    >
      {status === 'saving' ? (
        <>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: '#D97706' }}
          />
          Guardando borrador…
        </>
      ) : (
        <>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#059669' }} />
          Borrador guardado
        </>
      )}
    </span>
  );
}
