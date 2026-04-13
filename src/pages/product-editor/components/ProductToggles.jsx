import React from 'react';
import Icon from 'components/AppIcon';

function ToggleRow({ icon, iconColor, iconBg, title, description, checked, onChange, accentColor }) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-xl border transition-all duration-200"
      style={{
        borderColor: checked ? accentColor + '40' : 'var(--color-border)',
        backgroundColor: checked ? accentColor + '08' : 'transparent',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: checked ? accentColor + '18' : 'rgba(107,107,107,0.08)' }}
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

export default function ProductToggles({ activo, featured, onSale, onActiveChange, onFeaturedChange, onOnSaleChange }) {
  return (
    <div className="space-y-3">
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
      {/* TODO(compare_at_price): add a numeric input here for "Precio anterior (antes de oferta)".
          When onSale is true, show a field for compareAtPrice (e.g. "Precio anterior").
          Pass it up via a new onCompareAtPriceChange prop and wire to formData.compareAtPrice.
          The service layer (createProduct / updateProduct) already accepts compareAtPrice.
          In /ofertas, products with compareAtPrice > price show a strikethrough + % OFF badge. */}
      <ToggleRow
        icon="Tag"
        iconColor="#dc2626"
        iconBg="rgba(220,38,38,0.1)"
        accentColor="#dc2626"
        title="Marcar como oferta"
        description={onSale ? 'En el catálogo se muestra el badge «Oferta» (prioridad sobre destacado)' : 'Activa para resaltar precio u ofertas en la tarjeta del producto'}
        checked={!!onSale}
        onChange={onOnSaleChange}
      />
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
    </div>
  );
}
