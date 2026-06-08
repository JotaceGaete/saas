import React from 'react';
import Icon from 'components/AppIcon';
import { getPublicOffersUrl } from '../../../config/appUrl';

function ToggleRow({ icon, iconColor, iconBg, title, description, checked, onChange, accentColor }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: checked ? accentColor + '33' : 'rgba(17,24,39,0.08)',
        backgroundColor: checked ? accentColor + '08' : 'rgba(255,255,255,0.46)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: checked ? accentColor + '14' : 'rgba(17,24,39,0.05)' }}
        >
          <Icon name={icon} size={17} color={checked ? iconColor : 'var(--color-muted-foreground)'} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            {title}
          </p>
          <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
            {description}
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex items-center w-12 h-6 rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{
          backgroundColor: checked ? accentColor : 'var(--color-muted-foreground)',
          transition: 'background-color 0.2s ease',
        }}
        aria-label={title}
      >
        <span
          className="inline-block w-5 h-5 bg-white rounded-full shadow-sm"
          style={{
            transform: checked ? 'translateX(26px)' : 'translateX(2px)',
            transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
      </button>
    </div>
  );
}

export default function ProductToggles({ activo, featured, onSale, showInPos, slug = '', onActiveChange, onFeaturedChange, onOnSaleChange, onShowInPosChange, hideActive = false }) {
  const offersUrl = slug ? getPublicOffersUrl(slug) : '';

  return (
    <div className="space-y-3">
      {!hideActive && (
        <ToggleRow
          icon={activo ? 'Eye' : 'EyeOff'}
          iconColor="#059669"
          iconBg="rgba(5,150,105,0.1)"
          accentColor="#059669"
          title="Visible en el catálogo"
          description={activo ? 'Los clientes pueden ver y comprar este producto' : 'El producto está oculto del catálogo público'}
          checked={activo}
          onChange={onActiveChange}
        />
      )}

      <div>
        <ToggleRow
          icon="Tag"
          iconColor="#dc2626"
          iconBg="rgba(220,38,38,0.1)"
          accentColor="#dc2626"
          title="Incluir en página de ofertas"
          description={
            onSale
              ? 'Este producto ya aparece en tu página pública de ofertas y se destacará en el catálogo.'
              : 'Publica este producto en una página especial de ofertas que puedes compartir con tus clientes.'
          }
          checked={!!onSale}
          onChange={onOnSaleChange}
        />
        {/* Hint visible cuando el toggle está activo */}
        {onSale && (
          <div
            className="mt-1.5 rounded-lg px-3 py-3 flex flex-col gap-2"
            style={{
              backgroundColor: 'rgba(220,38,38,0.05)',
              border: '1px solid rgba(220,38,38,0.15)',
            }}
          >
            {/* A) Mensaje principal */}
            <p className="text-xs leading-snug flex items-center gap-1.5"
              style={{ color: '#dc2626', fontFamily: 'var(--font-caption)' }}>
              <span aria-hidden>🏷️</span>
              {offersUrl
                ? 'Este producto ya está disponible en tu página de ofertas.'
                : 'Este producto aparecerá en tu página de ofertas una vez que tu tienda esté publicada.'}
            </p>

            {/* B) URL clicable */}
            {offersUrl && (
              <a
                href={offersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-[11px] font-semibold underline-offset-2 transition-opacity hover:opacity-80"
                style={{
                  color: '#dc2626',
                  backgroundColor: 'rgba(220,38,38,0.08)',
                  fontFamily: 'var(--font-data)',
                  wordBreak: 'break-all',
                }}
              >
                <Icon name="ExternalLink" size={11} color="#dc2626" />
                {offersUrl}
              </a>
            )}

            {/* C) CTA de compartir */}
            {offersUrl && (
              <p className="text-[11px] leading-snug"
                style={{ color: '#dc2626', opacity: 0.7, fontFamily: 'var(--font-caption)' }}>
                Comparte este enlace para promocionar tus productos en oferta.
              </p>
            )}

            <p className="text-[11px] leading-snug"
              style={{ color: '#dc2626', opacity: 0.55, fontFamily: 'var(--font-caption)' }}>
              Agrega el precio anterior en el campo de precio para mostrar el % de descuento.
            </p>
          </div>
        )}
      </div>

      <ToggleRow
        icon="Star"
        iconColor="#D97706"
        iconBg="rgba(217,119,6,0.1)"
        accentColor="#D97706"
        title="Marcar como destacado"
        description={featured ? 'Badge «Más vendido» en la tarjeta si no hay oferta activa' : 'Ayuda a destacar productos populares en el catálogo'}
        checked={!!featured}
        onChange={onFeaturedChange}
      />

      {onShowInPosChange && (
        <ToggleRow
          icon="Monitor"
          iconColor="#3b82f6"
          iconBg="rgba(59,130,246,0.1)"
          accentColor="#3b82f6"
          title="Visible en TPV"
          description={showInPos ? 'Aparece en la grilla rápida del terminal de ventas' : 'Solo disponible al buscar en el TPV'}
          checked={!!showInPos}
          onChange={onShowInPosChange}
        />
      )}
    </div>
  );
}
