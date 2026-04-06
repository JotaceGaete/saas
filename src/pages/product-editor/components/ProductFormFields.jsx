import React from 'react';
import Icon from 'components/AppIcon';
import Input from 'components/ui/Input';
import { formatIntegerInputGrouped, parseCLPInput } from '../../../utils/formatCLP';

const MAX_NAME = 80;
const MAX_DESC = 300;

/** useCategories: si el negocio tiene categorías activadas. categories: array de { id, name } del negocio. */
/** onImproveWithAi: (text, productName) => Promise<void> — opcional; optimiza título y descripción y el padre actualiza el formulario. */

function formatPriceInput(value, locale) {
  return formatIntegerInputGrouped(value, locale);
}

export default function ProductFormFields({ formData, errors, onChange, currencyCode = 'USD', locale = 'en-US', useCategories = false, businessCategories = [], rubroCategories = [], onImproveWithAi, isImprovingDescription = false, publicCode = '' }) {
  const handleChange = (field, value) => onChange(field, value);
  const ownOptions   = Array.isArray(businessCategories) ? businessCategories.filter((c) => c?.name?.trim()) : [];
  const rubroOptions = Array.isArray(rubroCategories)    ? rubroCategories.filter((c) => c?.name?.trim())    : [];
  const hasOwn  = ownOptions.length > 0;
  const hasRubro = rubroOptions.length > 0;
  const useGroups = hasOwn && hasRubro; // solo agrupa si hay ambas fuentes

  return (
    <div className="space-y-5">
      {publicCode ? (
        <div
          className="p-3 rounded-lg border"
          style={{ backgroundColor: 'rgba(124,58,237,0.06)', borderColor: 'var(--color-border)' }}
        >
          <p className="text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
            Código WhatsApp
          </p>
          <p className="text-base font-semibold tracking-widest" style={{ fontFamily: 'var(--font-data)', color: 'var(--color-foreground)', letterSpacing: '0.12em' }}>
            {publicCode}
          </p>
          <p className="text-xs mt-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
            Se añade al mensaje del catálogo. Generado automáticamente; no se puede cambiar.
          </p>
        </div>
      ) : null}
      {/* Nombre */}
      <div>
        <div className="flex items-end justify-between mb-1">
          <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Nombre del producto <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <span className="text-xs" style={{ color: (formData?.nombre?.length || 0) > MAX_NAME * 0.9 ? 'var(--color-warning)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
            {formData?.nombre?.length || 0}/{MAX_NAME}
          </span>
        </div>
        <Input
          type="text"
          placeholder="Ej: Camiseta de algodón premium"
          value={formData?.nombre}
          onChange={(e) => handleChange('nombre', e?.target?.value?.slice(0, MAX_NAME))}
          error={errors?.nombre}
          required
        />
      </div>
      {/* Precio (entero, formato con separador de miles) */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Precio ({currencyCode}) <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="Ej: precio en entero"
          value={formatPriceInput(formData?.precio, locale)}
          onChange={(e) => {
            const raw = parseCLPInput(e?.target?.value);
            handleChange('precio', raw === '' ? '' : raw);
          }}
          error={errors?.precio}
          required
        />
      </div>
      {/* Descripción */}
      <div>
        <div className="flex items-end justify-between mb-1 flex-wrap gap-2">
          <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Descripción corta
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: (formData?.descripcion?.length || 0) > MAX_DESC * 0.9 ? 'var(--color-warning)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
              {formData?.descripcion?.length || 0}/{MAX_DESC}
            </span>
            {typeof onImproveWithAi === 'function' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onImproveWithAi(formData?.descripcion ?? '', formData?.nombre ?? '');
                  } catch (_) {
                    // Error manejado por el padre (toast)
                  }
                }}
                disabled={isImprovingDescription}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(124,58,237,0.1)',
                  color: 'var(--color-primary)',
                  fontFamily: 'var(--font-caption)',
                }}
                aria-label="Mejorar descripción con IA"
              >
                {isImprovingDescription ? (
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="Sparkles" size={12} color="var(--color-primary)" />
                )}
                Mejorar con IA
              </button>
            )}
          </div>
        </div>
        <textarea
          placeholder="Describe brevemente tu producto: materiales, características, usos..."
          value={formData?.descripcion}
          onChange={(e) => handleChange('descripcion', e?.target?.value?.slice(0, MAX_DESC))}
          rows={4}
          className="w-full px-3 py-2 text-sm rounded-md border resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-all"
          style={{
            borderColor: errors?.descripcion ? 'var(--color-error)' : 'var(--color-input)',
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-body)',
            borderRadius: 'var(--radius-sm)',
          }}
          aria-label="Descripción del producto"
        />
        {errors?.descripcion && (
          <p className="mt-1 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{errors?.descripcion}</p>
        )}
      </div>
      {/* Categoría (solo si el negocio tiene categorías activadas) */}
      {useCategories && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              Categoría
            </label>
            <a
              href="/business-configuration"
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              tabIndex={-1}
            >
              {hasOwn ? 'Gestionar mis categorías' : 'Crear categoría propia'}
            </a>
          </div>
          <select
            value={formData?.categoria ?? ''}
            onChange={(e) => handleChange('categoria', e?.target?.value)}
            className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            style={{
              borderColor: 'var(--color-input)',
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-caption)',
              borderRadius: 'var(--radius-sm)',
            }}
            aria-label="Categoría del producto"
          >
            <option value="">Sin categoría</option>
            {useGroups ? (
              <>
                <optgroup label="Mis categorías">
                  {ownOptions.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Sugeridas para tu rubro">
                  {rubroOptions.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              [...ownOptions, ...rubroOptions].map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))
            )}
          </select>
          {hasOwn && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Tus categorías aparecen primero.
            </p>
          )}
        </div>
      )}
      {/* Inventario */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Stock disponible
          <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span>
        </label>
        <Input
          type="number"
          placeholder="Ej: 50"
          value={formData?.stock}
          onChange={(e) => handleChange('stock', e?.target?.value)}
        />
        <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Deja vacío si no deseas controlar el inventario
        </p>
      </div>
    </div>
  );
}