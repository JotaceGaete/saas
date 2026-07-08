import React from 'react';
import Icon from 'components/AppIcon';

/**
 * Aviso NO bloqueante de que existe un borrador local disponible. A diferencia de
 * ConfirmDialog, no tiene overlay ni oscurece el fondo — el usuario puede ignorarlo por
 * completo y seguir usando el formulario con normalidad.
 */
export default function DraftBanner({
  isOpen,
  message = 'Hay un borrador anterior disponible.',
  restoreLabel = 'Restaurar borrador',
  discardLabel = 'Descartar',
  onRestore,
  onDiscard,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
      style={{ backgroundColor: 'rgba(37,99,235,0.06)', borderColor: 'rgba(37,99,235,0.18)' }}
      role="status"
    >
      <Icon name="History" size={16} color="var(--color-primary)" className="shrink-0" />
      <p className="min-w-[180px] flex-1 text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
        {message}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          {discardLabel}
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
        >
          {restoreLabel}
        </button>
      </div>
    </div>
  );
}
