import React from 'react';
import Icon from 'components/AppIcon';

export default function SaveBar({ isEditing, isSaving, saveSuccess, saveDisabled, onSave, onSaveAndNew, onCancel, onDiscardDraft, itemSingular = 'producto' }) {
  const saveButtonDisabled = isSaving || saveDisabled;
  const itemSingularLower = itemSingular.toLowerCase();
  return (
    <div
      className="sticky bottom-0 z-10 border-t px-4 backdrop-blur md:px-6 lg:pl-4 lg:pr-8"
      style={{
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderColor: 'rgba(17,24,39,0.08)',
        boxShadow: '0 -10px 30px rgba(15,23,42,0.08)',
        height: '68px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="flex items-center justify-between w-full max-w-6xl mx-auto gap-3">
        {/* Left: status */}
        <div className="flex items-center gap-2 min-w-0">
          {saveSuccess ? (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold scale-in"
              style={{
                backgroundColor: 'rgba(5,150,105,0.1)',
                color: '#059669',
                fontFamily: 'var(--font-caption)',
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center check-pop"
                style={{ backgroundColor: '#059669' }}
              >
                <Icon name="Check" size={11} color="#fff" />
              </div>
              ¡Guardado exitosamente!
            </div>
          ) : (
            <p
              className="text-xs hidden sm:block"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              {isEditing ? `Editando ${itemSingularLower} existente` : `Creando nuevo ${itemSingularLower}`}
            </p>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onDiscardDraft && (
            <button
              type="button"
              onClick={onDiscardDraft}
              disabled={isSaving}
              className="hidden px-3 py-2 text-sm font-medium text-red-600 transition-opacity hover:opacity-75 disabled:opacity-40 sm:block"
            >
              Descartar borrador
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            style={{
              color: 'var(--color-muted-foreground)',
              fontFamily: 'var(--font-caption)',
            }}
          >
            Cancelar
          </button>

          {!isEditing && (
            <button
              onClick={onSaveAndNew}
              disabled={saveButtonDisabled}
              className="hidden sm:flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-px active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: 'rgba(17,24,39,0.10)',
                color: 'var(--color-foreground)',
                backgroundColor: 'rgba(255,255,255,0.72)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              <Icon name="Plus" size={14} color="var(--color-foreground)" />
              {`Guardar y crear otro ${itemSingularLower}`}
            </button>
          )}

          <button
            onClick={onSave}
            disabled={saveButtonDisabled}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: saveSuccess ? '#059669' : '#111827',
              fontFamily: 'var(--font-caption)',
              boxShadow: saveSuccess
                ? '0 8px 20px rgba(5,150,105,0.22)'
                : '0 8px 20px rgba(17,24,39,0.18)',
              transition: 'background-color 300ms ease, box-shadow 300ms ease, transform 150ms ease, opacity 150ms ease',
              minWidth: '140px',
              justifyContent: 'center',
            }}
          >
            {isSaving ? (
              <>
                <div
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                />
                Guardando...
              </>
            ) : saveSuccess ? (
              <>
                <Icon name="CheckCircle" size={15} color="#fff" className="check-pop" />
                ¡Guardado!
              </>
            ) : (
              <>
                <Icon name="Save" size={15} color="#fff" />
                {isEditing ? 'Guardar cambios' : `Guardar ${itemSingularLower}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
