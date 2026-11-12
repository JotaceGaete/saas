import React from 'react';
import Icon from 'components/AppIcon';

function formatSavedAt(ts) {
  try {
    return new Date(ts).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Aviso de borrador recuperado + aviso de cambios sin guardar. */
export function DraftStatusBanner({ restoredAt, isDirty, persisted = true, onDiscard }) {
  if (restoredAt) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-2 p-3 rounded-lg text-sm border bg-amber-50 border-amber-200 text-amber-800"
      >
        <Icon name="History" size={16} />
        <span className="flex-1 min-w-0">
          Recuperamos un borrador sin guardar ({formatSavedAt(restoredAt)}). Revísalo y pulsa{' '}
          <strong>Guardar</strong> para no perderlo.
        </span>
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs font-semibold underline underline-offset-2 hover:text-amber-900"
        >
          Descartar borrador
        </button>
      </div>
    );
  }
  if (isDirty) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon name="CloudOff" size={14} />
        {persisted
          ? 'Cambios sin guardar · se conservan como borrador en este navegador'
          : 'Cambios sin guardar'}
      </div>
    );
  }
  return null;
}
