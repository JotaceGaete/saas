import React, { useEffect } from 'react';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';

/**
 * Warning modal shown when the user tries to share the catalog via WhatsApp
 * but the business has no OG cover image.
 *
 * This is a soft gate: the user can still share, but is clearly informed
 * that WhatsApp previews are cached on first access and won't update later.
 *
 * Props mirror the shape returned by useOgGuard:
 *   isOpen, onConfirm, onDismiss, onGoToConfig
 */
export default function OgShareGuardModal({ isOpen, onConfirm, onDismiss, onGoToConfig }) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-4 sm:p-6 overlay-enter"
      style={{ backgroundColor: 'rgba(15,15,25,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="og-guard-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-5"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(245,158,11,0.12)' }}
          >
            <Icon name="ImageOff" size={28} color="#D97706" />
          </div>
        </div>

        {/* Copy */}
        <div className="text-center space-y-2">
          <h3
            id="og-guard-title"
            className="text-base font-bold"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            Tu catálogo no tiene imagen de portada
          </h3>
          <p
            className="text-sm leading-relaxed"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--color-muted-foreground)' }}
          >
            WhatsApp solo genera la vista previa{' '}
            <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>una vez</span>.
            {' '}Si compartes ahora, no se actualizará después.
          </p>
          <div
            className="inline-flex items-start gap-2 px-3 py-2.5 rounded-xl text-left w-full"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <Icon name="ArrowRight" size={14} color="#D97706" className="flex-shrink-0 mt-0.5" />
            <p
              className="text-xs leading-relaxed"
              style={{ fontFamily: 'var(--font-caption)', color: '#92400E' }}
            >
              Sube una portada antes de compartir para que el preview se vea profesional.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="default"
            fullWidth
            iconName="Upload"
            iconPosition="left"
            onClick={onGoToConfig}
          >
            Subir portada
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={onConfirm}
          >
            Compartir igual
          </Button>
        </div>
      </div>
    </div>
  );
}
