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
      className="rounded-2xl border p-6"
      style={{
        backgroundColor: '#ffffff',
        borderColor: 'var(--color-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
          <Icon name={icon} size={18} color="var(--color-primary)" />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>{children}</div>
    </div>
  );
}

/**
 * Ajustes de layout del catálogo (JSONB `design_settings`).
 * Montado desde la pantalla principal **Diseño** (`/design`) vía `DesignCustomization`.
 */
export default function CatalogLayoutSettings({ design, onChange }) {
  const primaryColor = design?.primaryColor || '#7C3AED';
  const storeHeader = design?.storeHeader ?? { showStoreName: true, showDescription: true, showWhatsAppButton: true, descriptionColor: '' };
  const cardSettings = design?.cardSettings ?? { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true };

  const handleStoreHeaderToggle = (key) => {
    onChange?.({ ...design, storeHeader: { ...storeHeader, [key]: !storeHeader?.[key] } });
  };
  const handleCardSetting = (key, value) => {
    onChange?.({ ...design, cardSettings: { ...cardSettings, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard icon="Tags" title="Categorías en el catálogo" subtitle="Activa filtros por categoría. El rubro principal está en la pestaña Identidad.">
        <label
          className="flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all"
          style={{
            borderColor: design?.useCategories ? primaryColor : 'var(--color-border)',
            backgroundColor: design?.useCategories ? `${primaryColor}08` : '#fafafa',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: design?.useCategories ? `${primaryColor}18` : '#f0f0f8' }}>
              <Icon name="Tags" size={14} color={design?.useCategories ? primaryColor : '#a0a0b8'} />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>Usar categorías en el catálogo</span>
          </div>
          <div
            className="relative w-10 h-5.5 rounded-full transition-all flex-shrink-0 cursor-pointer"
            style={{ width: '40px', height: '22px', backgroundColor: design?.useCategories ? primaryColor : '#d1d5db' }}
            onClick={(e) => { e.preventDefault(); onChange?.({ ...design, useCategories: !design?.useCategories }); }}
          >
            <div className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: '18px', height: '18px', left: design?.useCategories ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
        </label>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
          Las categorías sugeridas dependen del <strong>rubro principal</strong> (Identidad). Si cambias de rubro, revisa tus categorías de producto.
        </p>
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)', lineHeight: '1.6' }}>
            ¿Necesitas categorías que no están en tu rubro?{' '}
            <a
              href="/business-configuration"
              className="font-semibold underline underline-offset-2"
              style={{ color: 'var(--color-primary)' }}
            >
              Crea tus propias categorías en Configuración →
            </a>
          </p>
        </div>
      </SectionCard>

      <SectionCard icon="Smartphone" title="Vista del catálogo en móvil" subtitle="Cómo se muestran los productos en celulares">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATALOG_VIEW_MODES?.map(mode => (
            <button
              key={mode?.id}
              type="button"
              onClick={() => onChange?.({ ...design, catalogViewMode: mode?.id })}
              className="relative flex flex-col gap-2 p-4 rounded-xl border-2 transition-all text-left"
              style={{
                borderColor: (design?.catalogViewMode || 'featured') === mode?.id ? primaryColor : 'var(--color-border)',
                backgroundColor: (design?.catalogViewMode || 'featured') === mode?.id ? `${primaryColor}08` : '#fafafa',
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

      <SectionCard icon="LayoutGrid" title="Diseño del catálogo" subtitle="Lista, cuadrícula o tarjetas grandes">
        <div className="grid grid-cols-3 gap-3">
          {CATALOG_LAYOUTS?.map(layout => (
            <button
              key={layout?.id}
              type="button"
              onClick={() => onChange?.({ ...design, catalogLayout: layout?.id })}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
              style={{
                borderColor: (design?.catalogLayout || 'list') === layout?.id ? primaryColor : 'var(--color-border)',
                backgroundColor: (design?.catalogLayout || 'list') === layout?.id ? `${primaryColor}08` : '#fafafa',
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

      <SectionCard icon="Type" title="Encabezado de la tienda" subtitle="Qué mostrar en la cabecera del catálogo">
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
                borderColor: storeHeader?.[item?.key] ? primaryColor : 'var(--color-border)',
                backgroundColor: storeHeader?.[item?.key] ? `${primaryColor}08` : '#fafafa',
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all"
                style={{ borderColor: isSelected ? primaryColor : 'var(--color-border)', backgroundColor: isSelected ? `${primaryColor}08` : '#fafafa' }}
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
                borderColor: cardSettings?.[item?.key] ? `${primaryColor}40` : 'var(--color-border)',
                backgroundColor: cardSettings?.[item?.key] ? `${primaryColor}05` : '#fafafa',
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
