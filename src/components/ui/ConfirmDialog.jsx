import React from 'react';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';

const ICON_BY_VARIANT = { warning: 'AlertTriangle', info: 'Info', destructive: 'Trash2' };
const ICON_BG_BY_VARIANT = {
  warning: 'rgba(217,119,6,0.12)',
  info: 'rgba(37,99,235,0.12)',
  destructive: 'rgba(184,92,92,0.12)',
};
const ICON_COLOR_BY_VARIANT = {
  warning: 'var(--color-warning)',
  info: 'var(--color-primary)',
  destructive: 'var(--color-destructive)',
};

/**
 * Generic two-button confirmation dialog (title + message + confirm/cancel).
 * Reused for "unsaved changes" prompts, "draft found" prompts, and similar
 * confirm/cancel decisions across the app — keep it free of feature-specific copy.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'default',
  variant = 'warning',
  icon,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;
  const iconName = icon || ICON_BY_VARIANT[variant] || 'AlertTriangle';

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 overlay-enter" style={{ backgroundColor: 'rgba(45,45,45,0.5)' }}>
      <div
        className="w-full max-w-sm rounded-xl border border-border p-6"
        style={{ backgroundColor: 'var(--color-card)', boxShadow: 'var(--shadow-xl)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: ICON_BG_BY_VARIANT[variant] || ICON_BG_BY_VARIANT.warning }}
          >
            <Icon name={iconName} size={26} color={ICON_COLOR_BY_VARIANT[variant] || ICON_COLOR_BY_VARIANT.warning} />
          </div>
          <div>
            <h3
              id="confirm-dialog-title"
              className="text-lg font-semibold text-foreground mb-1"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {title}
            </h3>
            {message && (
              <p className="text-sm text-muted-foreground" style={{ fontFamily: 'var(--font-body)' }}>
                {message}
              </p>
            )}
          </div>
          <div className="flex gap-3 w-full">
            <Button variant="outline" fullWidth onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button variant={confirmVariant} fullWidth onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
