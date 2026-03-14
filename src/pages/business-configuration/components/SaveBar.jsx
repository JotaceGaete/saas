import React from 'react';

import Button from 'components/ui/Button';

export default function SaveBar({ isDirty, isSaving, onSave, onDiscard }) {
  if (!isDirty) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t px-4 md:px-6 lg:pl-4 lg:pr-8"
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: 'var(--color-border)',
        boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.06)',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="flex items-center justify-between w-full max-w-screen-xl mx-auto gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--color-warning)' }}
            aria-hidden="true"
          />
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            Tienes cambios sin guardar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={isSaving}
          >
            Descartar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            loading={isSaving}
            iconName="Save"
            iconPosition="left"
            className="shadow-violet"
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}