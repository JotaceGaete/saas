import React from 'react';
import Icon from 'components/AppIcon';
import DesignCustomization from './DesignCustomization';
import CatalogLayoutSettings from './CatalogLayoutSettings';

/**
 * Pestaña Diseño: identidad visual (colores, portada, logo, tema, tipografía) + layout del catálogo.
 * Todo persiste en `design_settings` (wa_businesses).
 */
export default function DesignSettings({
  design,
  onChange,
  businessId,
  isSaving,
  onSave,
  showToast,
}) {
  return (
    <div className="flex flex-col gap-6">
      <DesignCustomization
        design={design}
        onChange={onChange}
        businessId={businessId}
        isSaving={isSaving}
        onSave={onSave}
        showToast={showToast}
        designOnly
        hideSaveButton
      />

      <div
        className="rounded-2xl border p-5 lg:p-6"
        style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
          >
            <Icon name="LayoutGrid" size={18} color="var(--color-primary)" />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
              Vista y disposición del catálogo
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              Categorías, móvil, cuadrícula, encabezado y tarjeta de producto
            </p>
          </div>
        </div>
        <CatalogLayoutSettings design={design} onChange={onChange} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-xs order-2 sm:order-1" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
          Estos ajustes se guardan en el campo <strong>design_settings</strong> de tu negocio.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="order-1 sm:order-2 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
            fontFamily: 'var(--font-caption)',
            boxShadow: '0 2px 8px rgba(139,92,246,0.35)',
          }}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Guardando...
            </>
          ) : (
            <>
              <Icon name="Save" size={14} color="#fff" />
              Guardar diseño
            </>
          )}
        </button>
      </div>
    </div>
  );
}
