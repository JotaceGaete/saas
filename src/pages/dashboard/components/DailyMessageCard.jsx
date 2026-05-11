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
      <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5" style={{ backgroundColor: 'rgba(255,255,255,0.46)', borderLeft: '2px solid rgba(17,24,39,0.16)' }}>
        <div
          className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: '#111827' }}
        >
          <Icon name="Lightbulb" size={14} color="#FFFFFF" />
        </div>
        <div className="min-w-0">
          <p
            className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
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
