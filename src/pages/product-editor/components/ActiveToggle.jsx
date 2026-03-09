import React from 'react';
import Icon from 'components/AppIcon';

export default function ActiveToggle({ active, onChange }) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border"
      style={{
        borderColor: active ? 'rgba(122,155,118,0.4)' : 'var(--color-border)',
        backgroundColor: active ? 'rgba(122,155,118,0.06)' : 'var(--color-muted)',
        borderRadius: 'var(--radius-md)',
        transition: 'all var(--transition-base)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: active ? 'rgba(122,155,118,0.15)' : 'rgba(107,107,107,0.1)' }}
        >
          <Icon name={active ? 'Eye' : 'EyeOff'} size={18} color={active ? 'var(--color-secondary)' : 'var(--color-muted-foreground)'} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Estado del producto
          </p>
          <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
            {active ? 'Visible en el catálogo público' : 'Oculto del catálogo público'}
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={active}
        onClick={() => onChange(!active)}
        className="relative inline-flex items-center w-12 h-6 rounded-full transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-shrink-0"
        style={{
          backgroundColor: active ? 'var(--color-secondary)' : 'var(--color-muted-foreground)',
          transition: 'background-color var(--transition-base)',
        }}
        aria-label="Activar o desactivar producto"
      >
        <span
          className="inline-block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-250"
          style={{ transform: active ? 'translateX(26px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  );
}