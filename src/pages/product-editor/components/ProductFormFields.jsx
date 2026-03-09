import React from 'react';
import Input from 'components/ui/Input';


const CURRENCIES = [
  { value: 'MXN', label: 'MXN $' },
  { value: 'COP', label: 'COP $' },
  { value: 'ARS', label: 'ARS $' },
  { value: 'PEN', label: 'PEN S/' },
  { value: 'CLP', label: 'CLP $' },
  { value: 'USD', label: 'USD $' },
  { value: 'EUR', label: 'EUR €' },
];

const CATEGORIES = [
  { value: '', label: 'Sin categoría' },
  { value: 'ropa', label: 'Ropa y accesorios' },
  { value: 'alimentos', label: 'Alimentos y bebidas' },
  { value: 'hogar', label: 'Hogar y decoración' },
  { value: 'belleza', label: 'Belleza y cuidado personal' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'juguetes', label: 'Juguetes y juegos' },
  { value: 'deportes', label: 'Deportes y fitness' },
  { value: 'otros', label: 'Otros' },
];

const MAX_NAME = 80;
const MAX_DESC = 300;

export default function ProductFormFields({ formData, errors, onChange }) {
  const handleChange = (field, value) => onChange(field, value);

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
      {/* Precio + Moneda */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Precio <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <div className="flex gap-2">
          <select
            value={formData?.currency}
            onChange={(e) => handleChange('currency', e?.target?.value)}
            className="flex-shrink-0 px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            style={{
              borderColor: 'var(--color-input)',
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-caption)',
              borderRadius: 'var(--radius-sm)',
              minWidth: '90px',
            }}
            aria-label="Moneda"
          >
            {CURRENCIES?.map(c => (
              <option key={c?.value} value={c?.value}>{c?.label}</option>
            ))}
          </select>
          <div className="flex-1">
            <Input
              type="number"
              placeholder="0.00"
              value={formData?.precio}
              onChange={(e) => handleChange('precio', e?.target?.value)}
              error={errors?.precio}
              required
            />
          </div>
        </div>
      </div>
      {/* Descripción */}
      <div>
        <div className="flex items-end justify-between mb-1">
          <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Descripción corta
          </label>
          <span className="text-xs" style={{ color: (formData?.descripcion?.length || 0) > MAX_DESC * 0.9 ? 'var(--color-warning)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
            {formData?.descripcion?.length || 0}/{MAX_DESC}
          </span>
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
      {/* Categoría */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Categoría
        </label>
        <select
          value={formData?.categoria}
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
          {CATEGORIES?.map(c => (
            <option key={c?.value} value={c?.value}>{c?.label}</option>
          ))}
        </select>
      </div>
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