import React from 'react';
import Icon from 'components/AppIcon';

export default function SaveBar({ isEditing, isSaving, saveSuccess, saveDisabled, onSave, onSaveAndNew, onCancel, itemSingular = 'producto' }) {
  const saveButtonDisabled = isSaving || saveDisabled;
  const itemSingularLower = itemSingular.toLowerCase();
  return (
    <div
      className="sticky bottom-0 z-10 border-t px-4 md:px-6 lg:pl-4 lg:pr-8"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
        boxShadow: '0 -4px 20px rgba(15,23,42,0.07)',
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
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-all duration-150 hover:bg-muted hover:-translate-y-px active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-foreground)',
                backgroundColor: 'var(--color-card)',
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
              backgroundColor: saveSuccess ? '#059669' : 'var(--color-primary)',
              fontFamily: 'var(--font-caption)',
              boxShadow: saveSuccess
                ? '0 4px 14px rgba(5,150,105,0.35)'
                : '0 4px 14px rgba(124,58,237,0.35)',
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
