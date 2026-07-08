import React from 'react';

export default function UnsavedChangesDialog({
  open,
  saving = false,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onKeepEditing,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2
          id="unsaved-changes-title"
          className="text-base font-bold"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
        >
          Tienes cambios sin guardar
        </h2>
        <p
          id="unsaved-changes-description"
          className="mt-2 text-sm"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}
        >
          Si abandonas esta página perderás toda la información que has ingresado.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={saving}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#059669', fontFamily: 'var(--font-caption)' }}
          >
            {saving ? 'Guardando...' : 'Guardar y salir'}
          </button>
          <button
            type="button"
            onClick={onLeaveWithoutSaving}
            disabled={saving}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#dc2626', fontFamily: 'var(--font-caption)' }}
          >
            Salir sin guardar
          </button>
          <button
            type="button"
            onClick={onKeepEditing}
            disabled={saving}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'rgba(17,24,39,0.06)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Seguir editando
          </button>
        </div>
      </div>
    </div>
  );
}
