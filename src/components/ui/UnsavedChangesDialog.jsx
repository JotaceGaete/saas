import React from 'react';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';

/**
 * Diálogo que aparece SOLO cuando el usuario intenta salir de un formulario con cambios
 * sin guardar (cambiar de sección, volver atrás, cerrar la pestaña, recargar, salir del
 * editor) — nunca al entrar ni mientras edita con normalidad.
 *
 * `onSaveAndLeave` es opcional: si el formulario que usa el guard tiene una acción de
 * guardado propia, se ofrece como opción primaria "Guardar y salir". Si no se pasa, el
 * diálogo solo ofrece "Salir sin guardar" / "Seguir editando".
 */
export default function UnsavedChangesDialog({
  isOpen,
  message = 'Si sales ahora perderás toda la información que has ingresado.',
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onKeepEditing,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 overlay-enter" style={{ backgroundColor: 'rgba(45,45,45,0.5)' }}>
      <div
        className="w-full max-w-sm rounded-xl border border-border p-6"
        style={{ backgroundColor: 'var(--color-card)', boxShadow: 'var(--shadow-xl)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-dialog-title"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(217,119,6,0.12)' }}
          >
            <Icon name="AlertTriangle" size={26} color="var(--color-warning)" />
          </div>
          <div>
            <h3
              id="unsaved-changes-dialog-title"
              className="text-lg font-semibold text-foreground mb-1"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Tienes cambios sin guardar
            </h3>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
              {message} ¿Qué deseas hacer?
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            {onSaveAndLeave && (
              <Button variant="default" fullWidth onClick={onSaveAndLeave}>
                Guardar y salir
              </Button>
            )}
            <Button variant="outline" fullWidth onClick={onLeaveWithoutSaving}>
              Salir sin guardar
            </Button>
            <Button variant="ghost" fullWidth onClick={onKeepEditing}>
              Seguir editando
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
