import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getRubros } from 'services/waBusinessService';
import { uploadTemplateImage } from 'services/mediaUploadService';
import { CATALOG_TEMPLATES as CATALOG_THEME_PRESETS } from 'utils/catalogTheme';
import { TEMPLATE_FAMILIES, TEMPLATE_FAMILY_LABELS } from 'utils/rubroFamilyMap';
import { TemplateCatalogPreview, PhoneMockup, TemplateFullPreviewModal } from './components/TemplateCatalogPreview';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  toggleTemplateActive,
  deleteOrDeactivateTemplate,
  duplicateTemplate,
  upsertTemplateCategories,
  upsertTemplateProducts,
} from 'services/catalogTemplateService';

// ─── Campo de imagen: subir archivo (R2) o pegar URL ──────────────────────────

function TemplateImageField({ label, value, onChange, templateId, variant, hint }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleFile = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadTemplateImage(file, { templateId, variant });
      onChange(result.url);
    } catch (err) {
      setUploadError(err?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>{label}</label>
      <div className="flex items-center gap-2">
        {value ? (
          <img src={value} alt="" className="w-10 h-10 rounded-lg object-cover border flex-shrink-0" style={{ borderColor: 'var(--color-border)' }} />
        ) : (
          <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--color-border)', background: 'var(--color-muted)' }}>
            <Icon name="Image" size={16} color="var(--color-muted-foreground)" />
          </div>
        )}
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… o sube un archivo"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer flex-shrink-0 transition-colors hover:bg-gray-50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
        >
          <Icon name={uploading ? 'Loader2' : 'Upload'} size={13} className={uploading ? 'animate-spin' : ''} color="currentColor" />
          {uploading ? 'Subiendo…' : 'Subir'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {uploadError && <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>{uploadError}</p>}
      {hint && !uploadError && <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>{hint}</p>}
    </div>
  );
}

// ─── Editor de plantilla (cabecera + categorías + productos) ──────────────────

const emptyCategory = () => ({ id: null, name: '', _key: Math.random().toString(36).slice(2) });
const emptyProduct = () => ({
  id: null, name: '', description: '', price: 0, imageUrl: '', categoryName: '',
  _key: Math.random().toString(36).slice(2),
});

function move(list, index, delta) {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function TemplateEditor({ templateId, rubros, onBack, onSaved, notify }) {
  const isNew = templateId === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', rubroSlug: '', familySlug: '', isActive: false,
    logoUrl: '', bannerUrl: '', previewImageUrl: '',
    primaryColor: '', secondaryColor: '', theme: '',
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPreviewOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await getTemplate(templateId);
      if (cancelled) return;
      if (error || !data) {
        notify(error?.message || 'No se pudo cargar la plantilla', 'error');
        onBack();
        return;
      }
      setTemplate(data);
      setForm({
        name: data.name, description: data.description, rubroSlug: data.rubroSlug || '',
        familySlug: data.familySlug || '',
        isActive: data.isActive, logoUrl: data.logoUrl || '', bannerUrl: data.bannerUrl || '',
        previewImageUrl: data.previewImageUrl || '',
        primaryColor: data.primaryColor || '', secondaryColor: data.secondaryColor || '', theme: data.theme || '',
      });
      setCategories(data.categories.map((c) => ({ ...c, _key: c.id })));
      setProducts(data.products.map((p) => ({ ...p, imageUrl: p.imageUrl || '', categoryName: p.categoryName || '', _key: p.id })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [templateId, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!String(form.name || '').trim()) {
      notify('El nombre de la plantilla es obligatorio', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { data, error } = await createTemplate(form);
        if (error || !data) {
          notify(error?.message || 'No se pudo crear la plantilla', 'error');
          return;
        }
        notify('Plantilla creada. Ahora puedes agregar categorías, productos e imágenes.', 'success');
        onSaved(data.id);
        return;
      }

      const { error: headerError } = await updateTemplate(templateId, form);
      if (headerError) {
        notify(headerError?.message || 'No se pudo guardar la plantilla', 'error');
        return;
      }
      const { error: catsError } = await upsertTemplateCategories(
        templateId,
        categories.map((c, i) => ({ id: c.id, name: c.name, sortOrder: i })),
      );
      if (catsError) {
        notify(catsError?.message || 'Error guardando categorías', 'error');
        return;
      }
      const { data: refreshed, error: prodsError } = await upsertTemplateProducts(
        templateId,
        products.map((p, i) => ({
          id: p.id, name: p.name, description: p.description, price: p.price,
          imageUrl: p.imageUrl, categoryName: p.categoryName, sortOrder: i,
        })),
      );
      if (prodsError) {
        notify(prodsError?.message || 'Error guardando productos', 'error');
        return;
      }
      if (refreshed) {
        setTemplate(refreshed);
        setCategories(refreshed.categories.map((c) => ({ ...c, _key: c.id })));
        setProducts(refreshed.products.map((p) => ({ ...p, imageUrl: p.imageUrl || '', categoryName: p.categoryName || '', _key: p.id })));
      }
      notify('Plantilla guardada correctamente.', 'success');
      onSaved(templateId);
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = (index) => {
    const cat = categories[index];
    const usedBy = products.filter((p) => p.categoryName && p.categoryName === cat.name).length;
    const message = cat.id
      ? `¿Eliminar la categoría "${cat.name}"?${usedBy > 0 ? ` ${usedBy} producto(s) quedarán sin categoría.` : ''}`
      : null;
    if (message && !window.confirm(message)) return;
    setCategories((list) => list.filter((_, i) => i !== index));
  };

  const removeProduct = (index) => {
    const prod = products[index];
    if (prod.id && !window.confirm(`¿Eliminar el producto "${prod.name || 'sin nombre'}" de la plantilla?`)) return;
    setProducts((list) => list.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
        <Icon name="Loader2" size={16} className="animate-spin" color="currentColor" /> Cargando plantilla…
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm';
  const inputStyle = { borderColor: 'var(--color-border)' };
  const categoryNames = categories.map((c) => c.name).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-75" style={{ color: 'var(--color-muted-foreground)' }}>
          <Icon name="ArrowLeft" size={15} color="currentColor" /> Volver al listado
        </button>
        <div className="flex items-center gap-2">
          {template?.source === 'system' && (
            <span className="px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>
              Plantilla de sistema: la usa el onboarding de su rubro
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Icon name={saving ? 'Loader2' : 'Save'} size={14} className={saving ? 'animate-spin' : ''} color="#fff" />
            {saving ? 'Guardando…' : isNew ? 'Crear plantilla' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* ── Cabecera ── */}
      <section className="rounded-xl border p-4 sm:p-5 bg-white space-y-4" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>Datos de la plantilla</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Nombre *</label>
            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ej: Artículos de fiesta" className={inputClass} style={inputStyle} />
          </div>
          <div className="sm:col-span-2 rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--color-border)', background: 'rgba(124,58,237,0.03)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
              Asignación de onboarding
            </p>
            <div className="rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'rgba(245,158,11,0.08)', color: '#92400E' }}>
              <strong>Guía de uso:</strong> usa <em>Familia</em> para escalar — un buen template cubre decenas de rubros.
              Usa <em>Rubro exacto</em> solo para casos especiales donde necesitas un catálogo 100% personalizado para ese rubro.<br />
              Prioridad de resolución: <strong>rubro exacto → familia → universal</strong>.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Familia (recomendado)</label>
                <select value={form.familySlug} onChange={(e) => setField('familySlug', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Sin familia</option>
                  {TEMPLATE_FAMILIES.map((f) => (
                    <option key={f} value={f}>{TEMPLATE_FAMILY_LABELS[f]} ({f})</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
                  {form.familySlug === 'universal'
                    ? 'Fallback general: cualquier rubro sin plantilla propia ni familia.'
                    : form.familySlug
                      ? `Sirve a todos los rubros de la familia "${form.familySlug}" que no tengan plantilla exacta.`
                      : 'Sin familia: la plantilla solo aplica por rubro exacto o uso manual.'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Rubro exacto (opcional)</label>
                <select value={form.rubroSlug} onChange={(e) => setField('rubroSlug', e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Sin rubro específico</option>
                  {rubros.map((r) => (
                    <option key={r.id} value={r.slug}>{r.name} ({r.slug})</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>
                  {form.rubroSlug
                    ? 'Máxima prioridad: gana sobre familia y universal para este rubro.'
                    : 'Deja vacío si quieres que la familia cubra todos los rubros del grupo.'}
                </p>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Descripción</label>
            <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={2} placeholder="Para qué tipo de negocio sirve esta plantilla" className={inputClass} style={inputStyle} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-foreground)' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} className="w-4 h-4" />
            Plantilla activa
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <TemplateImageField label="Logo" value={form.logoUrl} onChange={(v) => setField('logoUrl', v)} templateId={isNew ? undefined : templateId} variant="logo" />
          <TemplateImageField label="Portada / banner" value={form.bannerUrl} onChange={(v) => setField('bannerUrl', v)} templateId={isNew ? undefined : templateId} variant="banner" />
          <TemplateImageField label="Imagen de preview" value={form.previewImageUrl} onChange={(v) => setField('previewImageUrl', v)} templateId={isNew ? undefined : templateId} variant="preview" hint="Se muestra en el listado de plantillas" />
        </div>
      </section>

      {/* ── Apariencia de la plantilla ── */}
      <section className="rounded-xl border p-4 sm:p-5 bg-white space-y-4" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>Apariencia de la plantilla</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
            Identidad visual que recibe el negocio al aplicar la plantilla. Solo se usa si el negocio
            aún no personalizó sus colores o tema — nunca pisa cambios del usuario.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Color principal</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : '#7C3AED'}
                    onChange={(e) => setField('primaryColor', e.target.value)}
                    className="w-10 h-10 rounded-lg border cursor-pointer flex-shrink-0"
                    style={inputStyle}
                    aria-label="Elegir color principal"
                  />
                  <input
                    type="text"
                    value={form.primaryColor}
                    onChange={(e) => setField('primaryColor', e.target.value)}
                    placeholder="#7C3AED"
                    className={inputClass}
                    style={inputStyle}
                  />
                  {form.primaryColor && (
                    <button onClick={() => setField('primaryColor', '')} className="text-xs font-semibold flex-shrink-0 hover:opacity-70" style={{ color: 'var(--color-muted-foreground)' }}>
                      Quitar
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>Acento de botones, precios y badges.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Color secundario (fondo, opcional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.secondaryColor) ? form.secondaryColor : '#F8F8FB'}
                    onChange={(e) => setField('secondaryColor', e.target.value)}
                    className="w-10 h-10 rounded-lg border cursor-pointer flex-shrink-0"
                    style={inputStyle}
                    aria-label="Elegir color secundario"
                  />
                  <input
                    type="text"
                    value={form.secondaryColor}
                    onChange={(e) => setField('secondaryColor', e.target.value)}
                    placeholder="Hereda del tema"
                    className={inputClass}
                    style={inputStyle}
                  />
                  {form.secondaryColor && (
                    <button onClick={() => setField('secondaryColor', '')} className="text-xs font-semibold flex-shrink-0 hover:opacity-70" style={{ color: 'var(--color-muted-foreground)' }}>
                      Quitar
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>Tinte del fondo de página del catálogo.</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Tema visual</label>
              <div className="flex gap-2 flex-wrap">
                {[{ id: '', label: 'Por defecto', description: 'Claro estándar' }, ...Object.values(CATALOG_THEME_PRESETS)].map((preset) => (
                  <button
                    key={preset.id || 'default'}
                    type="button"
                    onClick={() => setField('theme', preset.id)}
                    className="px-3 py-2 rounded-lg border text-xs font-semibold transition-all"
                    style={(form.theme || '') === preset.id
                      ? { borderColor: 'var(--color-primary)', background: 'rgba(124,58,237,0.06)', color: 'var(--color-foreground)' }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
                  >
                    {preset.label}
                    <span className="block text-[10px] font-normal">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)' }}>Vista previa en vivo</p>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-75"
                style={{ color: 'var(--color-primary)' }}
              >
                <Icon name="Maximize2" size={11} color="currentColor" /> Abrir preview completo
              </button>
            </div>
            <PhoneMockup resetKey={templateId}>
              <TemplateCatalogPreview form={form} categories={categories} products={products} />
            </PhoneMockup>
            <p className="mt-2 text-[11px] text-center" style={{ color: 'var(--color-muted-foreground)' }}>
              Renderizado con los componentes reales del catálogo público.
            </p>
          </div>
        </div>
      </section>

      {isNew ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}>
          Crea la plantilla para empezar a agregar categorías y productos.
        </div>
      ) : (
        <>
          {/* ── Categorías ── */}
          <section className="rounded-xl border p-4 sm:p-5 bg-white space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>Categorías ({categories.length})</h2>
              <button
                onClick={() => setCategories((list) => [...list, emptyCategory()])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              >
                <Icon name="Plus" size={13} color="currentColor" /> Agregar categoría
              </button>
            </div>
            {categories.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Sin categorías. Los productos se mostrarán sin agrupar.</p>
            )}
            <div className="space-y-2">
              {categories.map((cat, index) => (
                <div key={cat._key} className="flex items-center gap-2">
                  <span className="text-xs w-5 text-center font-semibold" style={{ color: 'var(--color-muted-foreground)' }}>{index + 1}</span>
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => setCategories((list) => list.map((c, i) => (i === index ? { ...c, name: e.target.value } : c)))}
                    placeholder="Nombre de la categoría"
                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                    style={inputStyle}
                  />
                  <button onClick={() => setCategories((list) => move(list, index, -1))} disabled={index === 0} className="p-2 rounded-lg border disabled:opacity-30 hover:bg-gray-50" style={inputStyle} aria-label="Subir">
                    <Icon name="ChevronUp" size={14} color="var(--color-muted-foreground)" />
                  </button>
                  <button onClick={() => setCategories((list) => move(list, index, 1))} disabled={index === categories.length - 1} className="p-2 rounded-lg border disabled:opacity-30 hover:bg-gray-50" style={inputStyle} aria-label="Bajar">
                    <Icon name="ChevronDown" size={14} color="var(--color-muted-foreground)" />
                  </button>
                  <button onClick={() => removeCategory(index)} className="p-2 rounded-lg border hover:bg-red-50" style={{ borderColor: 'var(--color-border)' }} aria-label="Eliminar">
                    <Icon name="Trash2" size={14} color="var(--color-error)" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── Productos ── */}
          <section className="rounded-xl border p-4 sm:p-5 bg-white space-y-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>Productos de ejemplo ({products.length})</h2>
              <button
                onClick={() => setProducts((list) => [...list, emptyProduct()])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              >
                <Icon name="Plus" size={13} color="currentColor" /> Agregar producto
              </button>
            </div>
            {products.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                Sin productos. Agrega al menos 8-12 para que el catálogo de ejemplo se vea completo.
              </p>
            )}
            <div className="space-y-3">
              {products.map((prod, index) => (
                <div key={prod._key} className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-muted, #f8fafc)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-5 text-center font-semibold" style={{ color: 'var(--color-muted-foreground)' }}>{index + 1}</span>
                    <input
                      type="text"
                      value={prod.name}
                      onChange={(e) => setProducts((list) => list.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)))}
                      placeholder="Nombre del producto"
                      className="flex-1 px-3 py-2 rounded-lg border text-sm font-medium bg-white"
                      style={inputStyle}
                    />
                    <button onClick={() => setProducts((list) => move(list, index, -1))} disabled={index === 0} className="p-2 rounded-lg border bg-white disabled:opacity-30 hover:bg-gray-50" style={inputStyle} aria-label="Subir">
                      <Icon name="ChevronUp" size={14} color="var(--color-muted-foreground)" />
                    </button>
                    <button onClick={() => setProducts((list) => move(list, index, 1))} disabled={index === products.length - 1} className="p-2 rounded-lg border bg-white disabled:opacity-30 hover:bg-gray-50" style={inputStyle} aria-label="Bajar">
                      <Icon name="ChevronDown" size={14} color="var(--color-muted-foreground)" />
                    </button>
                    <button onClick={() => removeProduct(index)} className="p-2 rounded-lg border bg-white hover:bg-red-50" style={{ borderColor: 'var(--color-border)' }} aria-label="Eliminar">
                      <Icon name="Trash2" size={14} color="var(--color-error)" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Precio</label>
                      <input
                        type="number"
                        min="0"
                        value={prod.price}
                        onChange={(e) => setProducts((list) => list.map((p, i) => (i === index ? { ...p, price: e.target.value === '' ? 0 : Number(e.target.value) } : p)))}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Categoría</label>
                      <select
                        value={prod.categoryName}
                        onChange={(e) => setProducts((list) => list.map((p, i) => (i === index ? { ...p, categoryName: e.target.value } : p)))}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
                        style={inputStyle}
                      >
                        <option value="">Sin categoría</option>
                        {categoryNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:row-span-2">
                      <TemplateImageField
                        label="Imagen"
                        value={prod.imageUrl}
                        onChange={(v) => setProducts((list) => list.map((p, i) => (i === index ? { ...p, imageUrl: v } : p)))}
                        templateId={templateId}
                        variant="product"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Descripción</label>
                      <textarea
                        value={prod.description}
                        onChange={(e) => setProducts((list) => list.map((p, i) => (i === index ? { ...p, description: e.target.value } : p)))}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-white"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {previewOpen && (
        <TemplateFullPreviewModal
          form={form}
          categories={categories}
          products={products}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AdminCatalogTemplatesPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [templates, setTemplates] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { text, kind }
  const [editing, setEditing] = useState(null); // null | 'new' | templateId

  const notify = useCallback((text, kind = 'success') => {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await getTemplates({ includeInactive: true });
    if (error) {
      notify(error?.message || 'Error cargando plantillas', 'error');
      return;
    }
    setTemplates(data || []);
  }, [notify]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [, rubrosRes] = await Promise.all([loadTemplates(), getRubros()]);
      setRubros(rubrosRes?.data || []);
      setLoading(false);
    })();
  }, [loadTemplates]);

  const handleToggleActive = async (template) => {
    setBusyId(template.id);
    const { error } = await toggleTemplateActive(template.id, !template.isActive);
    setBusyId(null);
    if (error) {
      notify(error?.message || 'No se pudo cambiar el estado', 'error');
      return;
    }
    notify(template.isActive ? 'Plantilla desactivada.' : 'Plantilla activada.');
    loadTemplates();
  };

  const handleDuplicate = async (template) => {
    setBusyId(template.id);
    const { data, error } = await duplicateTemplate(template.id);
    setBusyId(null);
    if (error || !data) {
      notify(error?.message || 'No se pudo duplicar la plantilla', 'error');
      return;
    }
    notify(`Plantilla duplicada como "${data.name}" (inactiva).`);
    loadTemplates();
  };

  const handleDelete = async (template) => {
    const message = template.source === 'system'
      ? `"${template.name}" es una plantilla de sistema: no se elimina, solo se desactivará. ¿Continuar?`
      : `¿Eliminar definitivamente "${template.name}" con todas sus categorías y productos? Esta acción no se puede deshacer.`;
    if (!window.confirm(message)) return;
    setBusyId(template.id);
    const { data, error } = await deleteOrDeactivateTemplate(template.id);
    setBusyId(null);
    if (error) {
      notify(error?.message || 'No se pudo eliminar la plantilla', 'error');
      return;
    }
    notify(data?.deleted ? 'Plantilla eliminada.' : 'Plantilla de sistema desactivada.');
    loadTemplates();
  };

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <div className="sticky top-0 z-50 border-b px-4 md:px-6 lg:pl-4 lg:pr-6 py-0 flex items-center justify-between gap-3" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)', height: '60px' }}>
          <div>
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Catálogos de ejemplo</h1>
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Crea plantillas que Ventalink usará para llenar automáticamente negocios nuevos.
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
            <Icon name="Shield" size={14} color="var(--color-error)" />
            <span className="text-xs font-semibold hidden sm:inline" style={{ fontFamily: 'var(--font-caption)' }}>Solo admins</span>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-6" style={{ maxWidth: '1200px' }}>
          {notice && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm font-medium"
              style={notice.kind === 'error'
                ? { background: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }
                : { background: 'rgba(34,197,94,0.1)', color: '#15803D' }}
            >
              {notice.text}
            </div>
          )}

          {editing !== null ? (
            <TemplateEditor
              templateId={editing}
              rubros={rubros}
              notify={notify}
              onBack={() => { setEditing(null); loadTemplates(); }}
              onSaved={(id) => { setEditing(id); loadTemplates(); }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                  {loading ? 'Cargando…' : `${templates.length} plantilla(s)`}
                </p>
                <button
                  onClick={() => setEditing('new')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <Icon name="Plus" size={15} color="#fff" /> Crear plantilla
                </button>
              </div>

              <div className="space-y-2">
                {!loading && templates.length === 0 && (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}>
                    Aún no hay plantillas. Crea la primera con "Crear plantilla".
                  </div>
                )}
                {templates.map((t) => (
                  <div key={t.id} className="rounded-xl border bg-white p-3 sm:p-4 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--color-border)' }}>
                    {t.previewImageUrl || t.logoUrl ? (
                      <img src={t.previewImageUrl || t.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border flex-shrink-0" style={{ borderColor: 'var(--color-border)' }} />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--color-border)', background: 'var(--color-muted)' }}>
                        <Icon name="LayoutTemplate" size={18} color="var(--color-muted-foreground)" />
                      </div>
                    )}
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>{t.name}</span>
                        {t.primaryColor && (
                          <span className="w-3.5 h-3.5 rounded-full border flex-shrink-0" style={{ background: t.primaryColor, borderColor: 'var(--color-border)' }} title={`Color principal: ${t.primaryColor}`} />
                        )}
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={t.isActive
                            ? { background: 'rgba(34,197,94,0.12)', color: '#15803D' }
                            : { background: 'rgba(100,116,139,0.12)', color: '#475569' }}
                        >
                          {t.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                        {t.source === 'system' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>Sistema</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
                        {t.rubroSlug ? `Rubro: ${t.rubroSlug}` : 'Sin rubro asociado'}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setEditing(t.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                      >
                        <Icon name="Pencil" size={12} color="currentColor" /> Editar
                      </button>
                      <button
                        onClick={() => handleDuplicate(t)}
                        disabled={busyId === t.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                      >
                        <Icon name="Copy" size={12} color="currentColor" /> Duplicar
                      </button>
                      <button
                        onClick={() => handleToggleActive(t)}
                        disabled={busyId === t.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: 'var(--color-border)', color: t.isActive ? '#B45309' : '#15803D' }}
                      >
                        <Icon name={t.isActive ? 'PauseCircle' : 'PlayCircle'} size={12} color="currentColor" />
                        {t.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={busyId === t.id}
                        className="p-1.5 rounded-lg border transition-colors hover:bg-red-50 disabled:opacity-50"
                        style={{ borderColor: 'var(--color-border)' }}
                        aria-label="Eliminar plantilla"
                      >
                        <Icon name="Trash2" size={13} color="var(--color-error)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => navigate('/admin/businesses')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="ArrowLeft" size={14} color="#fff" />
                  Volver a negocios
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
