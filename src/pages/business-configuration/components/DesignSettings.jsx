import React from 'react';
import { Link } from 'react-router-dom';
import Icon from 'components/AppIcon';

/**
 * @deprecated Toda la configuración visual del catálogo está en la pantalla principal **Diseño** (`/design`).
 * Este componente solo orienta al usuario (Configuración ya no duplica esos bloques).
 */
export default function DesignSettings() {
  return (
    <div
      className="rounded-2xl border p-6 lg:p-8"
      style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(139,92,246,0.12)' }}
        >
          <Icon name="Palette" size={22} color="var(--color-primary)" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
            Diseño del catálogo
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
            Colores, categorías, layout, encabezado y tarjetas se configuran en un solo lugar para evitar duplicados.
          </p>
        </div>
        <Link
          to="/design"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
            fontFamily: 'var(--font-caption)',
            boxShadow: '0 2px 8px rgba(139,92,246,0.35)',
          }}
        >
          <Icon name="Palette" size={16} color="#fff" />
          Ir a Diseño
        </Link>
      </div>
    </div>
  );
}
