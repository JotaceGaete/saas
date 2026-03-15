import React from 'react';
import Icon from 'components/AppIcon';
import Input from 'components/ui/Input';
import { formatCLPInput, parseCLPInput } from 'utils/formatCLP';

const MAX_NAME = 80;
const MAX_DESC = 300;

/** useCategories: si el negocio tiene categorías activadas. categories: array de { id, name } del negocio. */
/** onImproveWithAi: (text, productName) => Promise<string> — opcional, para botón "Mejorar con IA". */
export default function ProductFormFields({ formData, errors, onChange, useCategories = false, categories = [], onImproveWithAi, isImprovingDescription = false }) {
  const handleChange = (field, value) => onChange(field, value);
  const categoryOptions = Array.isArray(categories) ? categories.filter((c) => c?.name?.trim()) : [];

  return (
    <div className="space-y-5">
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
      {/* Precio (CLP, solo enteros, formato con punto como separador de miles) */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Precio (CLP) <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="Ej: 150.000"
          value={formatCLPInput(formData?.precio)}
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
                    const improved = await onImproveWithAi(formData?.descripcion ?? '', formData?.nombre ?? '');
                    if (improved && typeof improved === 'string') {
                      handleChange('descripcion', improved.slice(0, MAX_DESC));
                    }
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
          <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Categoría
          </label>
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
            <option value="">Otros (sin categoría)</option>
            {categoryOptions?.map((c) => (
              <option key={c?.id} value={c?.name ?? ''}>{c?.name}</option>
            ))}
          </select>
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