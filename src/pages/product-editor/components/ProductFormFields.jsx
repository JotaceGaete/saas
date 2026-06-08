import React, { useState, useRef, useEffect } from 'react';
import Icon from 'components/AppIcon';
import Input from 'components/ui/Input';
import { formatIntegerInputGrouped, parseCLPInput } from '../../../utils/formatCLP';
import { createBusinessCategory } from '../../../services/waBusinessService';
import { getDiscountPercent } from '../../../utils/offerHelpers';

const MAX_NAME = 80;
const MAX_DESC = 300;
const MAX_LONG_DESC = 2000;

/** useCategories: si el negocio tiene categorías activadas. categories: array de { id, name } del negocio. */
/** onImproveWithAi: (text, productName) => Promise<void> — opcional; optimiza título y descripción y el padre actualiza el formulario. */

function formatPriceInput(value, locale) {
  return formatIntegerInputGrouped(value, locale);
}

export default function ProductFormFields({ formData, errors, onChange, currencyCode = 'USD', locale = 'en-US', useCategories = false, businessCategories = [], rubroCategories = [], onImproveWithAi, isImprovingDescription = false, publicCode = '', businessId, onCategoryCreated, isRestaurant = false, onGenerateBarcode, productId }) {
  const handleChange = (field, value) => onChange(field, value);
  const ownOptions   = Array.isArray(businessCategories) ? businessCategories.filter((c) => c?.name?.trim()) : [];
  const rubroOptions = Array.isArray(rubroCategories)    ? rubroCategories.filter((c) => c?.name?.trim())    : [];
  const hasOwn  = ownOptions.length > 0;
  const hasRubro = rubroOptions.length > 0;
  const useGroups = hasOwn && hasRubro; // solo agrupa si hay ambas fuentes
  const nameLabel = isRestaurant ? 'Nombre del plato' : 'Nombre del producto';
  const namePlaceholder = isRestaurant ? 'Ej: Hamburguesa clásica, Pizza napolitana, Combo familiar' : 'Ej: Camiseta de algodón premium';
  const pricePlaceholder = isRestaurant ? 'Ej: 5990' : 'Ej: precio en entero';
  const shortDescriptionLabel = isRestaurant ? 'Descripcion del plato' : 'Descripcion para el cliente';
  const shortDescriptionPlaceholder = isRestaurant
    ? 'Describe ingredientes, preparacion o detalles importantes.'
    : 'Cuenta que hace especial este producto.';
  const shortDescriptionHelp = isRestaurant
    ? 'Ayuda al cliente a entender sabor, ingredientes y porcion antes de pedir.'
    : 'Piensa en una descripcion de vitrina: clara, especifica y facil de leer.';
  const categoryLabel = isRestaurant ? 'Sección del menú' : 'Categoría';
  const categoryEmptyLabel = isRestaurant ? 'Ej: Hamburguesas, Pizzas, Bebidas, Menús' : 'Sin categoría';
  const categoryAriaLabel = isRestaurant ? 'Sección del menú del plato' : 'Categoría del producto';

  // ── Inline category creation modal ───────────────────────────────────────────
  const [showLongDesc, setShowLongDesc] = useState(!!formData?.longDescription);
  const [createOpen, setCreateOpen]   = useState(false);
  const [inputVal,   setInputVal]     = useState('');
  const [creating,   setCreating]     = useState(false);
  const [createError, setCreateError] = useState(null);
  const createInputRef = useRef(null);

  useEffect(() => {
    if (createOpen) {
      setInputVal('');
      setCreateError(null);
      // autofocus after transition frame
      const t = setTimeout(() => createInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [createOpen]);

  const handleCreate = async () => {
    const name = inputVal.trim();
    if (!name) { setCreateError('Escribe un nombre para la categoría'); return; }
    if (ownOptions.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setCreateError('Ya tienes una categoría con ese nombre');
      return;
    }
    setCreating(true);
    const { data, error } = await createBusinessCategory(businessId, { name, sortOrder: ownOptions.length });
    setCreating(false);
    if (error) { setCreateError(error.message || 'No se pudo crear la categoría'); return; }
    onCategoryCreated?.(data);
    handleChange('categoria', data.name);
    setCreateOpen(false);
  };

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

      {/* SKU / Código propio + Código de barras */}
      <div
        className="rounded-xl border p-4 space-y-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(17,24,39,0.02)' }}
      >
        <p className="text-[13px] font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
          Códigos del producto
        </p>

        {/* SKU */}
        <div>
          <label className="block text-[13px] font-semibold mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            SKU / Código propio
          </label>
          <Input
            type="text"
            placeholder="Ej: CAM-001, REF-2024"
            value={formData?.sku || ''}
            onChange={(e) => handleChange('sku', e?.target?.value)}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Tu código interno de referencia
          </p>
        </div>

        {/* Código de barras */}
        <div>
          <label className="block text-[13px] font-semibold mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Código de barras / EAN
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Ej: 7891234567890"
              value={formData?.barcode || ''}
              onChange={(e) => handleChange('barcode', e?.target?.value)}
              className="flex-1"
            />
            {formData?.barcode ? (
              <button
                type="button"
                title="Copiar código"
                onClick={() => navigator.clipboard?.writeText(formData.barcode)}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
              >
                <Icon name="Copy" size={13} />
                Copiar
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {onGenerateBarcode && (
              <button
                type="button"
                onClick={onGenerateBarcode}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-primary)' }}
              >
                <Icon name="Wand2" size={12} />
                {formData?.barcode ? 'Regenerar' : 'Generar código de barras interno'}
              </button>
            )}
            {productId && formData?.barcode && (
              <a
                href={`/crm/barcodes?product=${productId}`}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: 'rgba(5,150,105,0.08)', color: '#059669' }}
              >
                <Icon name="Printer" size={12} />
                Imprimir etiquetas
              </a>
            )}
          </div>

          <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Escanea o escribe el código · Puedes generar uno interno EAN-13 (prefijo 20).{' '}
            <span style={{ opacity: 0.7 }}>Este código es interno para tu negocio. No reemplaza un código comercial oficial GS1.</span>
          </p>
        </div>
      </div>

      {/* Nombre */}
      <div>
        <div className="flex items-end justify-between mb-1">
          <label className="block text-[13px] font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            {nameLabel} <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <span className="text-xs" style={{ color: (formData?.nombre?.length || 0) > MAX_NAME * 0.9 ? 'var(--color-warning)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
            {formData?.nombre?.length || 0}/{MAX_NAME}
          </span>
        </div>
        <Input
          type="text"
          placeholder={namePlaceholder}
          value={formData?.nombre}
          onChange={(e) => handleChange('nombre', e?.target?.value?.slice(0, MAX_NAME))}
          error={errors?.nombre}
          required
        />
      </div>
      {/* Precio (entero, formato con separador de miles) */}
      <div>
        <label className="block text-[13px] font-semibold mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
          Precio ({currencyCode}) <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <Input
          type="text"
          inputMode="numeric"
          placeholder={pricePlaceholder}
          value={formatPriceInput(formData?.precio, locale)}
          onChange={(e) => {
            const raw = parseCLPInput(e?.target?.value);
            handleChange('precio', raw === '' ? '' : raw);
          }}
          error={errors?.precio}
          required
        />
      </div>
      {/* Precio anterior — solo visible cuando el producto está marcado como oferta */}
      {formData?.onSale && (() => {
        const currentPrice = Number(formData?.precio) || 0;
        const compareAtPrice = formData?.compareAtPrice;
        const hasValue = compareAtPrice !== '' && compareAtPrice != null;
        const discount = getDiscountPercent(currentPrice, compareAtPrice);
        const hint = !hasValue
          ? { text: 'Puedes dejarlo vacío si solo quieres incluir el producto en la página de ofertas.', isWarning: false }
          : discount !== null
            ? { text: `Se mostrará un descuento aproximado de ${discount}% en la página de ofertas.`, isWarning: false }
            : { text: 'Para mostrar descuento, el precio anterior debe ser mayor al precio actual.', isWarning: true };
        return (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              Precio anterior ({currencyCode})
              <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span>
            </label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Ej: precio original antes del descuento"
              value={formatPriceInput(compareAtPrice, locale)}
              onChange={(e) => {
                const raw = parseCLPInput(e?.target?.value);
                handleChange('compareAtPrice', raw === '' ? '' : raw);
              }}
            />
            <p
              className="mt-1 text-xs flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-caption)',
                color: hint.isWarning ? '#D97706' : 'var(--color-muted-foreground)',
              }}
            >
              {hint.isWarning && <Icon name="AlertTriangle" size={11} color="#D97706" />}
              {hint.text}
            </p>
          </div>
        );
      })()}
      {/* Descripción */}
      <div>
        <div className="flex items-end justify-between mb-1 flex-wrap gap-2">
          <label className="block text-[13px] font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            {shortDescriptionLabel}
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
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:-translate-y-px disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.68)',
                  borderColor: 'rgba(17,24,39,0.10)',
                  color: 'var(--color-foreground)',
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
          placeholder={shortDescriptionPlaceholder}
          value={formData?.descripcion}
          onChange={(e) => handleChange('descripcion', e?.target?.value?.slice(0, MAX_DESC))}
          rows={4}
          className="w-full resize-none rounded-xl border px-3.5 py-3 text-sm leading-6 transition-all focus:outline-none focus:ring-2 focus:ring-ring"
          style={{
            borderColor: errors?.descripcion ? 'var(--color-error)' : 'var(--color-input)',
            backgroundColor: 'rgba(255,255,255,0.72)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-body)',
            borderRadius: 'var(--radius-sm)',
          }}
          aria-label="Descripción del producto"
        />
        <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {shortDescriptionHelp}
        </p>
        {errors?.descripcion && (
          <p className="mt-1 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{errors?.descripcion}</p>
        )}
      </div>
      {/* Descripción extendida (opcional) */}
      <div>
        <button
          type="button"
          onClick={() => {
            const next = !showLongDesc;
            setShowLongDesc(next);
            if (!next) handleChange('longDescription', '');
          }}
          className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: showLongDesc ? 'var(--color-primary)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span
            className="flex items-center justify-center w-4 h-4 rounded border transition-colors"
            style={{
              borderColor: showLongDesc ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: showLongDesc ? 'var(--color-primary)' : 'transparent',
            }}
          >
            {showLongDesc && <Icon name="Check" size={10} color="#fff" />}
          </span>
          Agregar más detalles
          <span className="text-xs font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span>
        </button>
        {showLongDesc && (
          <div className="mt-3">
            <div className="flex items-end justify-between mb-1">
              <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                Más detalles del producto
              </label>
              <span className="text-xs" style={{ color: (formData?.longDescription?.length || 0) > MAX_LONG_DESC * 0.9 ? 'var(--color-warning)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}>
                {formData?.longDescription?.length || 0}/{MAX_LONG_DESC}
              </span>
            </div>
            <textarea
              placeholder="Describe en detalle: ingredientes, tallas, materiales, instrucciones de uso, política de cambios..."
              value={formData?.longDescription || ''}
              onChange={(e) => handleChange('longDescription', e?.target?.value?.slice(0, MAX_LONG_DESC))}
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-md border resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              style={{
                borderColor: 'var(--color-input)',
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
                borderRadius: 'var(--radius-sm)',
              }}
              aria-label="Descripción extendida del producto"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Solo visible en el catálogo al pulsar "Más detalles". No reemplaza la descripción corta.
            </p>
          </div>
        )}
      </div>
      {/* Categoría (solo si el negocio tiene categorías activadas) */}
      {useCategories && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              {categoryLabel}
            </label>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-xs font-medium hover:underline focus:outline-none"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              tabIndex={-1}
            >
              + Crear categoría propia
            </button>
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
            aria-label={categoryAriaLabel}
          >
            <option value="">{categoryEmptyLabel}</option>
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

      {/* ── Modal: crear categoría ────────────────────────────────────────────── */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-xl shadow-xl"
            style={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
                  Nueva categoría
                </p>
                <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  Escribe el nombre y se añadirá automáticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:opacity-70"
                style={{ color: 'var(--color-muted-foreground)' }}
                aria-label="Cerrar"
              >
                <Icon name="X" size={16} color="currentColor" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pb-2">
              <input
                ref={createInputRef}
                type="text"
                maxLength={60}
                value={inputVal}
                onChange={(e) => { setInputVal(e.target.value); setCreateError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
                  if (e.key === 'Escape') setCreateOpen(false);
                }}
                placeholder="Ej: Ofertas, Novedades, Ropa..."
                className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: createError ? 'var(--color-error)' : 'var(--color-input)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-foreground)',
                  fontFamily: 'var(--font-caption)',
                  borderRadius: 'var(--radius-sm)',
                  '--tw-ring-color': 'var(--color-primary)',
                }}
              />
              {createError ? (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
                  {createError}
                </p>
              ) : (
                <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Máx. 60 caracteres · Límite de 30 categorías
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-muted-foreground)', backgroundColor: 'transparent', fontFamily: 'var(--font-caption)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !inputVal.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                {creating ? 'Creando...' : 'Crear categoría'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
