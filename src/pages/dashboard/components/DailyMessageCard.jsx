import React from 'react';
import Icon from 'components/AppIcon';

/**
 * Muestra el "Consejo del día" configurado por el admin.
 * Solo se renderiza cuando hay un mensaje no vacío.
 */
export default function DailyMessageCard({ message }) {
  if (!message?.trim()) return null;

  return (
    <section aria-label="Consejo del día" className="mb-5">
      <div className="flex items-start gap-3 rounded-2xl px-4 py-4" style={{ backgroundColor: 'rgba(255,255,255,0.68)', border: '1px solid rgba(17,24,39,0.07)' }}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: '#111827' }}
        >
          <Icon name="Lightbulb" size={16} color="#FFFFFF" />
        </div>
        <div className="min-w-0">
          <p
            className="text-xs font-semibold mb-1"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', letterSpacing: '0.03em' }}
          >
            Consejo del día
          </p>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}
          >
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}
