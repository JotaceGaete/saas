import React from 'react';
import Icon from 'components/AppIcon';

const OPTION_EXAMPLES = [
  'Sabores disponibles: vainilla, chocolate, frutilla',
  'Tallas: S, M, L, XL',
  'Colores: negro, blanco, azul',
  'Extras: sin cebolla, con queso extra',
];

export default function ProductOptionsSection({ hasOptions, optionsDescription, onHasOptionsChange, onOptionsDescriptionChange, isRestaurant = false }) {
  const itemLabel = isRestaurant ? 'plato' : 'producto';
  return (
    <div className="space-y-4">
      {/* Toggle row */}
      <div
        className="flex items-center justify-between rounded-xl border px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5"
        style={{
          borderColor: hasOptions ? 'rgba(22,163,74,0.26)' : 'rgba(17,24,39,0.08)',
          backgroundColor: hasOptions ? 'rgba(22,163,74,0.06)' : 'rgba(255,255,255,0.46)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: hasOptions ? 'rgba(22,163,74,0.12)' : 'rgba(17,24,39,0.05)' }}
          >
            <Icon name="ListChecks" size={17} color={hasOptions ? '#16a34a' : 'var(--color-muted-foreground)'} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              {`Este ${itemLabel} requiere opciones`}
            </p>
            <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
              {hasOptions ? 'El cliente deberá indicar su elección al pedir' : 'Sin opciones requeridas'}
            </p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={hasOptions}
          onClick={() => onHasOptionsChange(!hasOptions)}
          className="relative inline-flex items-center w-12 h-6 rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{
            backgroundColor: hasOptions ? '#25D366' : 'var(--color-muted-foreground)',
            transition: 'background-color 0.2s ease',
          }}
          aria-label={`Este ${itemLabel} requiere opciones`}
        >
          <span
            className="inline-block w-5 h-5 bg-white rounded-full shadow-sm"
            style={{
              transform: hasOptions ? 'translateX(26px)' : 'translateX(2px)',
              transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          />
        </button>
      </div>
      {/* Options description textarea — shown when toggle is on */}
      {hasOptions && (
        <div className="space-y-2">
          <label
            className="block text-sm font-medium"
            style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
          >
            {isRestaurant ? 'Describe las opciones que puede elegir el cliente' : 'Describe las opciones que debe indicar el cliente'}
          </label>
          <textarea
            value={optionsDescription}
            onChange={(e) => onOptionsDescriptionChange(e?.target?.value)}
            placeholder={OPTION_EXAMPLES?.[0]}
            rows={3}
            className="w-full resize-none rounded-xl border px-3.5 py-3 text-sm leading-6 transition-all focus:outline-none focus:ring-2 focus:ring-ring"
            style={{
              borderColor: 'var(--color-input)',
              backgroundColor: 'rgba(255,255,255,0.72)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-body)',
              borderRadius: 'var(--radius-sm)',
            }}
            aria-label={isRestaurant ? 'Descripción de opciones del plato' : 'Descripción de opciones del producto'}
          />
          {/* Examples */}
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ejemplos:</p>
            <div className="flex flex-wrap gap-1.5">
              {OPTION_EXAMPLES?.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOptionsDescriptionChange(ex)}
                  className="text-[11px] px-2 py-1 rounded-md border transition-all hover:opacity-80 active:scale-95"
                  style={{
                    borderColor: 'rgba(37,211,102,0.3)',
                    backgroundColor: 'rgba(37,211,102,0.06)',
                    color: '#16a34a',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {/* WhatsApp note */}
          <div
            className="flex items-start gap-2 p-3 rounded-lg"
            style={{ backgroundColor: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#16a34a" className="flex-shrink-0 mt-0.5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <p className="text-xs" style={{ color: '#16a34a', fontFamily: 'var(--font-caption)' }}>
              Estas opciones se incluirán en el mensaje de pedido por WhatsApp.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
