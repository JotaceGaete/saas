import React from 'react';
import Icon from 'components/AppIcon';

const CATALOG_LAYOUTS = [
  { id: 'list', label: 'Lista', description: 'Productos en fila horizontal', icon: 'LayoutList' },
  { id: 'grid', label: 'Cuadrícula', description: 'Productos en 2 columnas', icon: 'LayoutGrid' },
  { id: 'card', label: 'Tarjeta', description: 'Tarjetas grandes con imagen', icon: 'CreditCard' },
];

const CATALOG_VIEW_MODES = [
  { id: 'featured', label: 'Vista destacada', description: '1 columna en móvil, tarjetas grandes', icon: 'LayoutGrid' },
  { id: 'compact', label: 'Vista compacta', description: '2 columnas en móvil, tarjetas pequeñas', icon: 'LayoutList' },
];

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        backgroundColor: 'rgba(255,255,255,0.70)',
        borderColor: 'rgba(17,24,39,0.08)',
        boxShadow: '0 12px 30px rgba(17,24,39,0.045)',
      }}
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(17,24,39,0.06)' }}>
          <Icon name={icon} size={16} color="var(--color-foreground)" />
        </div>
        <div>
          <h3 className="text-base font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)', letterSpacing: '-0.015em' }}>{title}</h3>
          {subtitle && <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="border-t pt-5" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>{children}</div>
    </div>
  );
}

/**
 * Ajustes de layout del catálogo (JSONB `design_settings`).
 * Montado desde la pantalla principal **Diseño** (`/design`) vía `DesignCustomization`.
 */
export default function CatalogLayoutSettings({ design, onChange, isRestaurant = false }) {
  const primaryColor = design?.primaryColor || '#7C3AED';
  const storeHeader = design?.storeHeader ?? { showStoreName: true, showDescription: true, showWhatsAppButton: true, descriptionColor: '' };
  const cardSettings = design?.cardSettings ?? { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true };
  const catalogLabel = isRestaurant ? 'menú' : 'catálogo';
  const storeLabel = isRestaurant ? 'restaurante' : 'tienda';

  const handleStoreHeaderToggle = (key) => {
    onChange?.({ ...design, storeHeader: { ...storeHeader, [key]: !storeHeader?.[key] } });
  };
  const handleCardSetting = (key, value) => {
    onChange?.({ ...design, cardSettings: { ...cardSettings, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard icon="Tags" title={`Categorías en el ${catalogLabel}`} subtitle="Organiza la experiencia de compra con filtros de categoría.">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: 'rgba(17,24,39,0.08)', backgroundColor: 'rgba(255,255,255,0.58)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#f0f0f8' }}>
            <Icon name="Settings" size={14} color="#a0a0b8" />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
            El toggle "Mostrar categorías en el catálogo" y la gestión de categorías propias se encuentran en{' '}
            <a
              href="/business-configuration"
              className="font-semibold underline underline-offset-2"
              style={{ color: 'var(--color-primary)' }}
            >
              Configuración del negocio →
            </a>
          </p>
        </div>
        {design?.useCategories && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            ✓ Las categorías están activas en tu catálogo público.
          </p>
        )}
      </SectionCard>

      <SectionCard icon="Smartphone" title={`Vista del ${catalogLabel} en móvil`} subtitle="Define la densidad de productos en celulares.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATALOG_VIEW_MODES?.map(mode => (
            <button
              key={mode?.id}
              type="button"
              onClick={() => onChange?.({ ...design, catalogViewMode: mode?.id })}
              className="relative flex flex-col gap-2 p-4 rounded-xl border transition-all duration-200 text-left hover:-translate-y-0.5"
              style={{
                borderColor: (design?.catalogViewMode || 'featured') === mode?.id ? `${primaryColor}66` : 'rgba(17,24,39,0.08)',
                backgroundColor: (design?.catalogViewMode || 'featured') === mode?.id ? `${primaryColor}08` : 'rgba(255,255,255,0.58)',
              }}
            >
              {(design?.catalogViewMode || 'featured') === mode?.id && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                  <Icon name="Check" size={11} color="#fff" />
                </div>
              )}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (design?.catalogViewMode || 'featured') === mode?.id ? `${primaryColor}20` : '#f0f0f8' }}>
                <Icon name={mode?.icon} size={18} color={(design?.catalogViewMode || 'featured') === mode?.id ? primaryColor : '#a0a0b8'} />
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: (design?.catalogViewMode || 'featured') === mode?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{mode?.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{mode?.description}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon="LayoutGrid" title={`Layout del ${catalogLabel}`} subtitle="Elige la estructura que mejor muestra tus productos.">
        <div className="grid grid-cols-3 gap-3">
          {CATALOG_LAYOUTS?.map(layout => (
            <button
              key={layout?.id}
              type="button"
              onClick={() => onChange?.({ ...design, catalogLayout: layout?.id })}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 hover:-translate-y-0.5"
              style={{
                borderColor: (design?.catalogLayout || 'list') === layout?.id ? `${primaryColor}66` : 'rgba(17,24,39,0.08)',
                backgroundColor: (design?.catalogLayout || 'list') === layout?.id ? `${primaryColor}08` : 'rgba(255,255,255,0.58)',
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (design?.catalogLayout || 'list') === layout?.id ? `${primaryColor}15` : '#f0f0f8' }}>
                <Icon name={layout?.icon} size={18} color={(design?.catalogLayout || 'list') === layout?.id ? primaryColor : '#a0a0b8'} />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold" style={{ color: (design?.catalogLayout || 'list') === layout?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{layout?.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{layout?.description}</p>
              </div>
              {(design?.catalogLayout || 'list') === layout?.id && (
                <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                  <Icon name="Check" size={9} color="#fff" />
                </div>
              )}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon="Type" title={`Encabezado de la ${storeLabel}`} subtitle={`Define qué aparece al inicio del ${catalogLabel}.`}>
        <div className="flex flex-col gap-2">
          {[
            { key: 'showStoreName', label: 'Mostrar nombre de la tienda', icon: 'Type' },
            { key: 'showDescription', label: 'Mostrar descripción', icon: 'AlignLeft' },
            { key: 'showWhatsAppButton', label: 'Mostrar botón de WhatsApp', icon: 'MessageCircle' },
          ]?.map(item => (
            <label
              key={item?.key}
              className="flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all"
              style={{
                borderColor: storeHeader?.[item?.key] ? `${primaryColor}66` : 'rgba(17,24,39,0.08)',
                backgroundColor: storeHeader?.[item?.key] ? `${primaryColor}08` : 'rgba(255,255,255,0.58)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: storeHeader?.[item?.key] ? `${primaryColor}18` : '#f0f0f8' }}>
                  <Icon name={item?.icon} size={14} color={storeHeader?.[item?.key] ? primaryColor : '#a0a0b8'} />
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{item?.label}</span>
              </div>
              <div
                className="relative w-10 h-5.5 rounded-full transition-all flex-shrink-0"
                style={{ width: '40px', height: '22px', backgroundColor: storeHeader?.[item?.key] ? primaryColor : '#d1d5db' }}
                onClick={() => handleStoreHeaderToggle(item?.key)}
              >
                <div className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: '18px', height: '18px', left: storeHeader?.[item?.key] ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs font-bold mt-4 mb-2" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Color del texto de la descripción</p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: '', label: 'Por defecto' },
            { value: '#374151', label: 'Gris oscuro' },
            { value: '#1f2937', label: 'Casi negro' },
            { value: primaryColor, label: 'Color principal' },
            { value: '#059669', label: 'Verde' },
            { value: '#0284c7', label: 'Azul' },
          ].map(({ value, label }) => {
            const isSelected = (storeHeader?.descriptionColor || '') === value;
            return (
              <button
                key={value || 'default'}
                type="button"
                onClick={() => onChange?.({ ...design, storeHeader: { ...storeHeader, descriptionColor: value } })}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 hover:-translate-y-0.5"
                style={{ borderColor: isSelected ? `${primaryColor}66` : 'rgba(17,24,39,0.08)', backgroundColor: isSelected ? `${primaryColor}08` : 'rgba(255,255,255,0.58)' }}
                title={label}
              >
                {value ? <span className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: value }} /> : <span className="w-5 h-5 rounded-full border border-gray-300 bg-white" />}
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{label}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon="CreditCard" title="Tarjeta de producto" subtitle="Qué mostrar en cada producto del catálogo">
        <div className="flex flex-col gap-2">
          {[
            { key: 'showPrice', label: 'Mostrar precio', icon: 'DollarSign', description: 'Precio del producto' },
            { key: 'showDescription', label: 'Mostrar descripción', icon: 'AlignLeft', description: 'Texto descriptivo' },
            { key: 'showStock', label: 'Mostrar stock', icon: 'Package', description: 'Disponibilidad' },
            { key: 'showWhatsApp', label: 'Botón de WhatsApp', icon: 'MessageCircle', description: 'Contactar' },
          ]?.map(item => (
            <div
              key={item?.key}
              className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all"
              style={{
                borderColor: cardSettings?.[item?.key] ? `${primaryColor}40` : 'rgba(17,24,39,0.08)',
                backgroundColor: cardSettings?.[item?.key] ? `${primaryColor}05` : 'rgba(255,255,255,0.58)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cardSettings?.[item?.key] ? `${primaryColor}15` : '#f0f0f8' }}>
                  <Icon name={item?.icon} size={15} color={cardSettings?.[item?.key] ? primaryColor : '#a0a0b8'} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{item?.label}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{item?.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCardSetting(item?.key, !cardSettings?.[item?.key])}
                className="relative flex-shrink-0 transition-all"
                style={{
                  width: '44px', height: '24px', borderRadius: '12px',
                  backgroundColor: cardSettings?.[item?.key] ? primaryColor : '#d1d5db',
                }}
              >
                <span
                  className="absolute top-0.5 transition-all"
                  style={{
                    width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    left: cardSettings?.[item?.key] ? '22px' : '2px',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
