import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';

const CURRENCY_SYMBOLS = {
  MXN: '$', COP: '$', ARS: '$', PEN: 'S/', CLP: '$', USD: '$', EUR: '€',
};

export default function ProductPreview({ nombre, precio, currency, descripcion, activo, featured, images }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const mainImage = images?.[activeIdx] || images?.[0];
  const symbol = CURRENCY_SYMBOLS?.[currency] || '$';
  const priceNum = parseFloat(precio);
  const formattedPrice = !isNaN(priceNum) && priceNum > 0
    ? `${symbol}${priceNum?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  // Reset active index if images change
  const safeIdx = Math.min(activeIdx, Math.max(0, (images?.length || 1) - 1));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}
        >
          <Icon name="Smartphone" size={14} color="var(--color-primary)" />
        </div>
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
          Vista previa
        </h3>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: activo ? 'rgba(5,150,105,0.1)' : 'rgba(107,107,107,0.1)',
            color: activo ? '#059669' : 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
        >
          {activo ? '● Visible' : '○ Oculto'}
        </span>
      </div>

      {/* Phone mockup */}
      <div className="mx-auto" style={{ maxWidth: '240px' }}>
        <div
          className="rounded-3xl border-2 overflow-hidden shadow-xl"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: '#f8f8f8',
            boxShadow: '0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {/* Phone notch */}
          <div
            className="flex items-center justify-center py-2"
            style={{ backgroundColor: '#1a1a1a' }}
          >
            <div className="w-14 h-1 rounded-full" style={{ backgroundColor: '#333' }} />
          </div>

          {/* Status bar */}
          <div
            className="flex items-center justify-between px-3 py-1"
            style={{ backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0' }}
          >
            <span style={{ fontSize: '0.6rem', color: '#666', fontFamily: 'var(--font-caption)' }}>Mi Tienda</span>
            <div className="flex items-center gap-1">
              <Icon name="Wifi" size={9} color="#666" />
              <Icon name="Battery" size={9} color="#666" />
            </div>
          </div>

          {/* Product image */}
          <div className="relative aspect-square w-full overflow-hidden" style={{ backgroundColor: '#f0f0f0' }}>
            {mainImage ? (
              <Image src={mainImage?.url} alt={mainImage?.alt || nombre} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Icon name="ImageOff" size={28} color="#ccc" />
                <span style={{ fontSize: '0.65rem', color: '#aaa', fontFamily: 'var(--font-caption)' }}>Sin imagen</span>
              </div>
            )}

            {/* Featured badge */}
            {featured && (
              <div
                className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#D97706', boxShadow: '0 2px 8px rgba(217,119,6,0.4)' }}
              >
                <Icon name="Star" size={9} color="#fff" />
                <span style={{ fontSize: '0.6rem', color: '#fff', fontFamily: 'var(--font-caption)', fontWeight: 600 }}>Destacado</span>
              </div>
            )}

            {/* Image counter */}
            {images?.length > 1 && (
              <div
                className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <span style={{ fontSize: '0.6rem', color: '#fff', fontFamily: 'var(--font-data)' }}>
                  {safeIdx + 1}/{images?.length}
                </span>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {images?.length > 1 && (
            <div className="flex gap-1.5 px-2.5 py-2" style={{ backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0' }}>
              {images?.slice(0, 5)?.map((img, i) => (
                <button
                  key={img?.id}
                  onClick={() => setActiveIdx(i)}
                  className="flex-shrink-0 rounded-md overflow-hidden transition-all duration-150"
                  style={{
                    width: '28px',
                    height: '28px',
                    border: `2px solid ${i === safeIdx ? 'var(--color-primary)' : '#e5e5e5'}`,
                    borderRadius: '6px',
                    opacity: i === safeIdx ? 1 : 0.65,
                    transform: i === safeIdx ? 'scale(1.08)' : 'scale(1)',
                  }}
                  aria-label={`Ver imagen ${i + 1}`}
                >
                  <Image src={img?.url} alt={img?.alt} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Product info */}
          <div className="p-3" style={{ backgroundColor: '#fff' }}>
            {nombre ? (
              <h4
                className="font-bold line-clamp-2 mb-1"
                style={{ fontFamily: 'var(--font-heading)', color: '#1a1a1a', fontSize: '0.8rem', lineHeight: '1.3' }}
              >
                {nombre}
              </h4>
            ) : (
              <div className="h-3.5 rounded-md mb-1 w-3/4" style={{ backgroundColor: '#ebebeb' }} />
            )}

            {descripcion ? (
              <p
                className="line-clamp-2 mb-2.5"
                style={{ color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.68rem', lineHeight: '1.4' }}
              >
                {descripcion}
              </p>
            ) : (
              <div className="space-y-1 mb-2.5">
                <div className="h-2.5 rounded w-full" style={{ backgroundColor: '#ebebeb' }} />
                <div className="h-2.5 rounded w-2/3" style={{ backgroundColor: '#ebebeb' }} />
              </div>
            )}

            <div className="flex items-center justify-between">
              {formattedPrice ? (
                <span
                  className="font-bold"
                  style={{ fontFamily: 'var(--font-data)', color: 'var(--color-primary)', fontSize: '0.95rem' }}
                >
                  {formattedPrice}
                </span>
              ) : (
                <div className="h-4 rounded w-14" style={{ backgroundColor: '#ebebeb' }} />
              )}
              <button
                className="px-2.5 py-1 rounded-lg text-white font-semibold"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  fontFamily: 'var(--font-caption)',
                  fontSize: '0.65rem',
                }}
                tabIndex={-1}
                aria-hidden="true"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tip */}
      <div
        className="mt-4 p-3 rounded-xl flex items-start gap-2"
        style={{ backgroundColor: 'rgba(232,184,109,0.1)', borderRadius: 'var(--radius-md)' }}
      >
        <Icon name="Lightbulb" size={13} color="var(--color-accent)" className="flex-shrink-0 mt-0.5" />
        <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', lineHeight: '1.5' }}>
          Productos con imagen y descripción completa reciben hasta 3× más pedidos.
        </p>
      </div>
    </div>
  );
}