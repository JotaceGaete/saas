import React, { useState, useRef, useEffect } from 'react';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';
import { uploadBusinessLogo, uploadBusinessCover } from '../../../services/waBusinessService';
import CatalogLayoutSettings from './CatalogLayoutSettings';
import { CATALOG_TEMPLATES, getTextColorForBg, isValidHex } from '../../../utils/catalogTheme';

const CATALOG_STYLES = [
  {
    id: 'clasico',
    label: 'Clásico',
    description: 'Sombras suaves, bordes redondeados',
    preview: { shadow: '0 2px 8px rgba(0,0,0,0.12)', radius: '12px', spacing: '12px', bg: '#f7f7f9' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Sin sombras, líneas limpias',
    preview: { shadow: 'none', radius: '6px', spacing: '8px', bg: '#ffffff' },
  },
  {
    id: 'destacado',
    label: 'Destacado',
    description: 'Sombras pronunciadas, más espacio',
    preview: { shadow: '0 6px 24px rgba(0,0,0,0.18)', radius: '18px', spacing: '16px', bg: '#f0f0f8' },
  },
];

const COLORS = [
  { value: '#7C3AED', label: 'Violet' },
  { value: '#4F46E5', label: 'Indigo' },
  { value: '#E11D48', label: 'Rose' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#0D9488', label: 'Teal' },
  { value: '#059669', label: 'Emerald' },
  { value: '#0284C7', label: 'Sky' },
  { value: '#475569', label: 'Slate' },
  { value: '#DB2777', label: 'Pink' },
  { value: '#D97706', label: 'Amber' },
];

const THEMES = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Limpio y profesional',
    preview: { bg: '#ffffff', header: '#f8f8f8', accent: '#7C3AED', text: '#1a1a2e', card: '#ffffff', border: '#e5e7eb' },
  },
  {
    id: 'gradient',
    label: 'Gradient',
    description: 'Moderno y vibrante',
    preview: { bg: '#f5f3ff', header: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)', accent: '#7C3AED', text: '#ffffff', card: '#ffffff', border: '#ede9fe' },
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Elegante y sofisticado',
    preview: { bg: '#1a1a2e', header: '#16213e', accent: '#7C3AED', text: '#ffffff', card: '#0f3460', border: '#2d2d4e' },
  },
];

const FONTS = [
  { id: 'Inter', label: 'Inter' },
  { id: 'Urbanist', label: 'Urbanist' },
  { id: 'Poppins', label: 'Poppins' },
];
const FONT_PREVIEW_LINES = { sample: 'Aa Bb Cc 123', body: 'Texto del catálogo' };

function SectionCard({ icon, title, subtitle, children, accent }) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        backgroundColor: '#ffffff',
        borderColor: accent ? `${accent}30` : 'var(--color-border)',
        boxShadow: accent ? `0 1px 4px ${accent}15` : '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: accent ? `${accent}15` : 'rgba(139,92,246,0.1)' }}
        >
          <Icon name={icon} size={18} color={accent || 'var(--color-primary)'} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
        {children}
      </div>
    </div>
  );
}

function StyleMiniCard({ style, primaryColor, isSelected }) {
  return (
    <div
      className="w-full rounded-lg overflow-hidden flex flex-col gap-1.5 p-2"
      style={{
        backgroundColor: style?.preview?.bg,
        border: `1px solid ${isSelected ? primaryColor : '#e5e7eb'}`,
        minHeight: '72px',
      }}
    >
      {[1, 2]?.map(i => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: style?.preview?.radius,
            boxShadow: style?.preview?.shadow,
            border: '1px solid #e8e8f0',
          }}
        >
          <div className="w-5 h-5 rounded flex-shrink-0" style={{ backgroundColor: '#e8e8f0', borderRadius: '4px' }} />
          <div className="flex-1">
            <div className="h-1.5 rounded-full" style={{ backgroundColor: '#d8d8e8', width: '60%' }} />
          </div>
          <div className="h-4 rounded-full px-1.5 flex items-center" style={{ backgroundColor: primaryColor, minWidth: '28px' }}>
            <span style={{ color: '#fff', fontSize: '7px', fontWeight: 700 }}>+</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ThemeMiniPreview({ theme, primaryColor }) {
  const isGradient = theme?.id === 'gradient';
  const isDark = theme?.id === 'dark';
  return (
    <div
      className="w-full rounded-lg overflow-hidden"
      style={{ height: '72px', backgroundColor: theme?.preview?.bg, border: `1px solid ${theme?.preview?.border}` }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5"
        style={{
          background: isGradient ? `linear-gradient(135deg, ${primaryColor} 0%, #4F46E5 100%)` : isDark ? theme?.preview?.header : theme?.preview?.header,
          height: '28px',
        }}
      >
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: isGradient || isDark ? 'rgba(255,255,255,0.3)' : '#e0e0ec' }} />
        <div className="h-1.5 rounded-full flex-1" style={{ backgroundColor: isGradient || isDark ? 'rgba(255,255,255,0.4)' : '#d0d0e0', maxWidth: '50px' }} />
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-1">
        {[1, 2]?.map(i => (
          <div key={i} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ backgroundColor: isDark ? theme?.preview?.card : '#f9f9fc', border: `1px solid ${theme?.preview?.border}` }}>
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#e8e8f0' }} />
            <div className="flex-1">
              <div className="h-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : '#d8d8e8', width: '60%' }} />
            </div>
            <div className="h-1 rounded-full" style={{ backgroundColor: primaryColor, width: '20px', opacity: 0.8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Encabezados de sección en la pantalla Diseño (orden unificado). */
function DesignUnifiedHeading({ title, subtitle, isFirst }) {
  return (
    <div
      className={`flex flex-col gap-1 ${isFirst ? 'pt-0' : 'border-t border-slate-100 pt-8'}`}
    >
      <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>{title}</h2>
      {subtitle ? (
        <p className="text-xs pb-1" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

export default function DesignCustomization({
  design,
  onChange,
  businessId,
  businessName,
  userEmail,
  isSaving,
  onSave,
  showToast,
  hideSaveButton = false,
  isDirty = false,
  showSaved = false,
  onReset,
}) {
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const shareInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingShareImage, setUploadingShareImage] = useState(false);

  // Cargar la fuente seleccionada para el catálogo (preview móvil, etc.)
  useEffect(() => {
    const font = design?.font || 'Inter';
    if (font === 'Inter') return;
    const linkId = `gfont-${font}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.replace(/\s+/g, '+'))}:wght@400;500;600;700&display=swap`;
    document.head?.appendChild(link);
  }, [design?.font]);

  // Precargar Inter, Urbanist y Poppins para que las tarjetas de tipografía muestren la fuente real
  useEffect(() => {
    FONTS.forEach(({ id }) => {
      const linkId = `gfont-preview-${id}`;
      if (document.getElementById(linkId)) return;
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(id.replace(/\s+/g, '+'))}:wght@400;500;600;700&display=swap`;
      document.head?.appendChild(link);
    });
  }, []);

  /** Propaga cambios del draft al padre sin persistir. */
  const handleChange = (newDesign) => {
    onChange?.(newDesign);
  };

  const handleLogoUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !businessId) {
      if (!businessId) console.warn('[DesignCustomization] handleLogoUpload: sin businessId');
      return;
    }
    console.log('[DesignCustomization] Subiendo logo', file.name);
    setUploadingLogo(true);
    try {
      const { url, error } = await uploadBusinessLogo(file, businessId);
      if (error) {
        console.error('[DesignCustomization] Error subir logo', error);
        showToast?.(error?.message || 'Error al subir logo', 'error');
        return;
      }
      handleChange({ ...design, logoUrl: url });
      showToast?.('Logo actualizado', 'success');
    } catch (err) {
      console.error('[DesignCustomization] Excepción subir logo', err);
      showToast?.(err?.message || 'Error inesperado al subir logo', 'error');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef?.current) logoInputRef.current.value = '';
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !businessId) {
      if (!businessId) console.warn('[DesignCustomization] handleCoverUpload: sin businessId');
      return;
    }
    console.log('[DesignCustomization] Subiendo portada', file.name);
    setUploadingCover(true);
    try {
      const { url, error } = await uploadBusinessCover(file, businessId);
      if (error) {
        console.error('[DesignCustomization] Error subir portada', error);
        showToast?.(error?.message || 'Error al subir imagen de portada', 'error');
        return;
      }
      handleChange({ ...design, headerImageUrl: url });
      showToast?.('Portada actualizada', 'success');
    } catch (err) {
      console.error('[DesignCustomization] Excepción subir portada', err);
      showToast?.(err?.message || 'Error inesperado al subir imagen', 'error');
    } finally {
      setUploadingCover(false);
      if (coverInputRef?.current) coverInputRef.current.value = '';
    }
  };

  const handleShareImageUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !businessId) {
      if (!businessId) console.warn('[DesignCustomization] handleShareImageUpload: sin businessId');
      return;
    }
    console.log('[DesignCustomization] Subiendo shareImageUrl', file.name);
    setUploadingShareImage(true);
    try {
      // Reutiliza el mismo uploader de portada (R2). No modifica la portada visual del catálogo.
      const { url, error } = await uploadBusinessCover(file, businessId);
      if (error) {
        console.error('[DesignCustomization] Error subir share image', error);
        showToast?.(error?.message || 'Error al subir imagen para compartir', 'error');
        return;
      }
      handleChange({ ...design, shareImageUrl: url });
      showToast?.('Imagen para compartir actualizada', 'success');
    } catch (err) {
      console.error('[DesignCustomization] Excepción subir share image', err);
      showToast?.(err?.message || 'Error inesperado al subir imagen', 'error');
    } finally {
      setUploadingShareImage(false);
      if (shareInputRef?.current) shareInputRef.current.value = '';
    }
  };

  const primaryColor = design?.primaryColor || '#7C3AED';
  const selectedStyle = design?.catalogStyle || 'clasico';
  const selectedTheme = design?.theme || 'minimal';
  const selectedTemplate = design?.template || 'light';
  const customBgColor = design?.backgroundColor || '';
  const selectedFont = design?.font || 'Inter';

  const saveLabel = isSaving ? 'Guardando...' : showSaved ? 'Guardado ✓' : 'Guardar cambios';
  const statusLabel = isSaving ? 'Guardando...' : showSaved ? 'Guardado ✓' : isDirty ? 'Cambios sin guardar' : null;
  const statusColor = isSaving ? 'var(--color-text-tertiary)' : showSaved ? '#059669' : '#f59e0b';

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">

      {/* ── Sticky header: título + botón guardar ── */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
        style={{
          backgroundColor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderColor: 'var(--color-border)',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}
      >
        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
          Diseño
        </span>
        <div className="flex items-center gap-3">
          {statusLabel && (
            <span className="hidden sm:block text-xs font-medium" style={{ color: statusColor, fontFamily: 'var(--font-caption)' }}>
              {statusLabel}
            </span>
          )}
          {isDirty && onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={isSaving}
              className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
              style={{
                color: 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              <Icon name="RotateCcw" size={11} color="var(--color-text-tertiary)" />
              Restablecer
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || (!isDirty && !showSaved)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: showSaved
                ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                : `linear-gradient(135deg, ${primaryColor} 0%, #7c3aed 100%)`,
              fontFamily: 'var(--font-caption)',
              boxShadow: isDirty ? `0 2px 8px ${primaryColor}55` : 'none',
            }}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Guardando...
              </>
            ) : showSaved ? (
              <>
                <Icon name="Check" size={12} color="#fff" />
                Guardado
              </>
            ) : (
              <>
                <Icon name="Save" size={12} color="#fff" />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </div>

      <DesignUnifiedHeading isFirst title="Apariencia" subtitle="Color, portada y logo" />

      {/* 1. Primary Color */}
      <SectionCard icon="Droplets" title="Color principal" subtitle="Se aplica a botones, badges y acentos de tu catálogo" accent={primaryColor}>
        <div className="flex flex-wrap items-center gap-4">
          {COLORS?.map(color => (
            <button
              key={color?.value}
              onClick={() => handleChange({ ...design, primaryColor: color?.value })}
              title={color?.label}
              className="relative w-8 h-8 rounded-full transition-all flex-shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: color?.value,
                boxShadow: primaryColor === color?.value ? `0 0 0 3px #ffffff, 0 0 0 5px ${color?.value}` : '0 1px 3px rgba(0,0,0,0.2)',
                transform: primaryColor === color?.value ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              {primaryColor === color?.value && <Icon name="Check" size={13} color="#fff" />}
            </button>
          ))}
          {/* Custom color input */}
          <div className="relative flex-shrink-0 flex items-center gap-2">
            <div
              className="relative w-8 h-8 rounded-full overflow-hidden border-2 cursor-pointer flex items-center justify-center"
              style={{ borderColor: 'var(--color-border)', backgroundColor: primaryColor }}
              title="Color personalizado"
            >
              <input
                type="color"
                value={primaryColor}
                onChange={e => handleChange({ ...design, primaryColor: e?.target?.value })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Color personalizado"
              />
              <Icon name="Pipette" size={12} color="#fff" />
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              {primaryColor}
            </span>
          </div>
        </div>
        {/* Color preview bar */}
        <div className="mt-5 pt-1 flex items-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: primaryColor, fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Plus" size={11} color="#fff" />
            Agregar
          </div>
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: primaryColor, fontFamily: 'var(--font-caption)', fontSize: '10px' }}
          >
            Activo
          </div>
          <div
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #6D28D9 100%)`, fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="ShoppingCart" size={11} color="#fff" />
            Ver pedido
          </div>
          <span className="text-xs pl-0.5 sm:pl-1" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Vista previa de elementos
          </span>
        </div>
      </SectionCard>

      {/* 1b. Background Template + Color */}
      <SectionCard icon="PaintBucket" title="Fondo del catálogo" subtitle="Define el color de fondo y el estilo base. El color del texto se ajusta automáticamente." accent={primaryColor}>
        {/* Template chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.values(CATALOG_TEMPLATES).map((tpl) => {
            const isSelected = selectedTemplate === tpl.id && !customBgColor;
            const autoText = getTextColorForBg(tpl.bgColor);
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleChange({ ...design, template: tpl.id, backgroundColor: '' })}
                className="flex flex-col items-start gap-2 p-3 rounded-xl border-2 transition-all text-left min-w-[90px]"
                style={{
                  borderColor: isSelected ? primaryColor : 'var(--color-border)',
                  backgroundColor: isSelected ? `${primaryColor}08` : '#fafafa',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <div
                    className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Icon name="Check" size={9} color="#fff" />
                  </div>
                )}
                {/* Mini preview swatch */}
                <div
                  className="w-full rounded-lg flex flex-col gap-1 p-2"
                  style={{ backgroundColor: tpl.bgColor, border: `1px solid ${tpl.borderColor}`, minHeight: '44px' }}
                >
                  <div className="rounded" style={{ height: '8px', backgroundColor: tpl.cardBg, border: `1px solid ${tpl.borderColor}` }} />
                  <div className="rounded" style={{ height: '8px', backgroundColor: tpl.cardBg, border: `1px solid ${tpl.borderColor}`, width: '70%' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{tpl.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{tpl.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom background color override */}
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
            Color personalizado <span style={{ color: 'var(--color-text-tertiary)' }}>(opcional — reemplaza el fondo del template)</span>
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Color picker */}
            <div
              className="relative w-9 h-9 rounded-xl overflow-hidden border-2 cursor-pointer flex items-center justify-center flex-shrink-0"
              style={{ borderColor: customBgColor ? primaryColor : 'var(--color-border)', backgroundColor: customBgColor || '#f8f8fb' }}
              title="Elegir color de fondo"
            >
              <input
                type="color"
                value={customBgColor || '#f8f8fb'}
                onChange={(e) => handleChange({ ...design, backgroundColor: e.target.value })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Color de fondo personalizado"
              />
              <Icon name="Pipette" size={13} color={customBgColor ? getTextColorForBg(customBgColor) : '#a0a0b8'} />
            </div>

            {/* Hex input */}
            <input
              type="text"
              value={customBgColor}
              onChange={(e) => {
                const val = e.target.value.trim();
                handleChange({ ...design, backgroundColor: val });
              }}
              placeholder="#f8f8fb"
              maxLength={7}
              className="h-9 px-3 rounded-lg border text-xs font-mono w-28 focus:outline-none focus:ring-2"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-background)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-caption)',
                '--tw-ring-color': primaryColor,
              }}
            />

            {/* Auto text color preview */}
            {isValidHex(customBgColor) && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium"
                style={{
                  backgroundColor: customBgColor,
                  color: getTextColorForBg(customBgColor),
                  borderColor: 'var(--color-border)',
                  fontFamily: 'var(--font-caption)',
                }}
              >
                <Icon name="Type" size={11} color={getTextColorForBg(customBgColor)} />
                Texto automático
              </div>
            )}

            {/* Clear custom color */}
            {customBgColor && (
              <button
                type="button"
                onClick={() => handleChange({ ...design, backgroundColor: '' })}
                className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}
              >
                Restablecer
              </button>
            )}
          </div>
          <p className="text-[10px] mt-2.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            El color del texto se determina automáticamente para máximo contraste y legibilidad.
          </p>
        </div>
      </SectionCard>

      {/* 2. Cover Image */}
      <SectionCard icon="Image" title="Imagen de portada" subtitle="Banner que aparece en la parte superior de tu catálogo público">
        <div className="flex flex-col gap-3">
          <div
            className="relative rounded-xl overflow-hidden border-2 flex items-center justify-center group cursor-pointer transition-all hover:border-violet-400"
            style={{
              borderColor: design?.headerImageUrl ? primaryColor : 'var(--color-border)',
              backgroundColor: '#f0f0f8',
              aspectRatio: '16/5',
              minHeight: '80px',
            }}
            onClick={() => coverInputRef?.current?.click()}
          >
            {design?.headerImageUrl ? (
              <>
                {/* Capa fondo blur — preview del smart banner */}
                <Image
                  key={`bg-${design?.headerImageUrl}`}
                  src={design?.headerImageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: 'cover',
                    objectPosition: `50% ${design?.coverPositionY ?? 50}%`,
                    filter: 'blur(10px)',
                    transform: 'scale(1.15)',
                    opacity: 0.75,
                  }}
                />
                {/* Capa principal: imagen con posición ajustable */}
                <Image
                  key={design?.headerImageUrl}
                  src={design?.headerImageUrl}
                  alt="Imagen de portada del catálogo"
                  className="absolute inset-0 w-full h-full"
                  style={{ objectFit: 'cover', objectPosition: `50% ${design?.coverPositionY ?? 50}%` }}
                />
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                >
                  <Icon name="Camera" size={20} color="#fff" />
                  <span className="text-xs text-white font-medium" style={{ fontFamily: 'var(--font-caption)' }}>Cambiar portada</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6">
                {uploadingCover ? (
                  <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(139,92,246,0.2)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <Icon name="ImagePlus" size={24} color="#a0a0b8" />
                )}
                <span className="text-xs" style={{ color: '#a0a0b8', fontFamily: 'var(--font-caption)' }}>
                  {uploadingCover ? 'Subiendo...' : 'Haz clic para subir una imagen de portada'}
                </span>
                <span className="text-xs" style={{ color: '#c0c0d0', fontFamily: 'var(--font-caption)' }}>Recomendado: 1200×630px</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => coverInputRef?.current?.click()}
              disabled={uploadingCover}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80 disabled:opacity-50"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: '#ffffff', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Upload" size={12} color="var(--color-text-secondary)" />
              {uploadingCover ? 'Subiendo...' : design?.headerImageUrl ? 'Cambiar portada' : 'Subir portada'}
            </button>
            {design?.headerImageUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); handleChange({ ...design, headerImageUrl: '' }); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                style={{ border: '1px solid #fecaca', color: '#ef4444', backgroundColor: '#fff5f5', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Trash2" size={12} color="#ef4444" />
                Eliminar portada
              </button>
            )}
          </div>
          {design?.headerImageUrl && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                  Ajustar posición de portada
                </label>
                <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                  {design?.coverPositionY ?? 50}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Arriba</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={design?.coverPositionY ?? 50}
                  onChange={(e) => handleChange({ ...design, coverPositionY: Number(e.target.value) })}
                  className="flex-1 h-1.5 cursor-pointer rounded-full accent-violet-500"
                  style={{ accentColor: primaryColor }}
                />
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Abajo</span>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* 3. WhatsApp Share Image */}
      {(() => {
        const hasShareImage = !!(design?.shareImageUrl || '').trim();
        return (
          <div
            className="rounded-2xl border p-6"
            style={{
              backgroundColor: '#ffffff',
              borderColor: hasShareImage ? 'rgba(5,150,105,0.3)' : 'rgba(245,158,11,0.35)',
              boxShadow: hasShareImage ? '0 1px 4px rgba(5,150,105,0.1)' : '0 1px 4px rgba(245,158,11,0.12)',
            }}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: hasShareImage ? 'rgba(5,150,105,0.12)' : 'rgba(245,158,11,0.12)' }}
              >
                <Icon name={hasShareImage ? 'CheckCircle' : 'ImageOff'} size={18} color={hasShareImage ? '#059669' : '#D97706'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
                    Imagen de vista previa para WhatsApp
                  </h3>
                  {!hasShareImage && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#B45309', fontFamily: 'var(--font-caption)', letterSpacing: '0.04em' }}
                    >
                      RECOMENDADO
                    </span>
                  )}
                  {hasShareImage && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ backgroundColor: 'rgba(5,150,105,0.12)', color: '#059669', fontFamily: 'var(--font-caption)' }}
                    >
                      <Icon name="Check" size={9} color="#059669" />
                      Lista
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                  {hasShareImage
                    ? 'Tu vista previa de WhatsApp está lista. Así verán tu catálogo cuando lo compartas.'
                    : 'Esta imagen es la que verán tus clientes cuando compartas tu catálogo por WhatsApp.'}
                </p>
              </div>
            </div>

            {/* Preview area */}
            <div
              className="rounded-xl overflow-hidden border mb-4"
              style={{
                borderColor: hasShareImage ? 'rgba(5,150,105,0.2)' : 'rgba(245,158,11,0.25)',
                backgroundColor: hasShareImage ? '#f0fdf4' : '#fffbeb',
              }}
            >
              {hasShareImage ? (
                <Image
                  key={design.shareImageUrl}
                  src={design.shareImageUrl}
                  alt="Vista previa de imagen para compartir en WhatsApp"
                  className="w-full"
                  style={{ aspectRatio: '1200/630', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 py-8 px-6 text-center"
                  style={{ aspectRatio: '1200/630', maxHeight: '220px' }}
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}
                  >
                    <Icon name="Image" size={22} color="#D97706" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#92400E', fontFamily: 'var(--font-caption)' }}>
                      Sin imagen configurada
                    </p>
                    <p className="text-[11px] leading-relaxed" style={{ color: '#B45309', fontFamily: 'var(--font-caption)' }}>
                      Recomendado: 1200×630 px (horizontal)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Description + warning */}
            {!hasShareImage && (
              <div
                className="rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2.5"
                style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <Icon name="AlertTriangle" size={13} color="#D97706" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium mb-0.5" style={{ color: '#92400E', fontFamily: 'var(--font-caption)' }}>
                    Te recomendamos configurarla antes de compartir tu enlace para que tu catálogo se vea profesional desde el primer momento.
                  </p>
                  <p className="text-[11px]" style={{ color: '#B45309', fontFamily: 'var(--font-caption)' }}>
                    Si compartes sin esta imagen, WhatsApp puede mostrar una vista previa menos atractiva o tardar en actualizarla.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => shareInputRef?.current?.click()}
                disabled={uploadingShareImage}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                style={
                  hasShareImage
                    ? { border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: '#ffffff', fontFamily: 'var(--font-caption)' }
                    : { backgroundColor: '#D97706', color: '#ffffff', fontFamily: 'var(--font-caption)', boxShadow: '0 2px 8px rgba(217,119,6,0.3)' }
                }
              >
                <Icon name="Upload" size={12} color={hasShareImage ? 'var(--color-text-secondary)' : '#ffffff'} />
                {uploadingShareImage ? 'Subiendo...' : hasShareImage ? 'Cambiar imagen' : 'Configurar imagen'}
              </button>
              {hasShareImage && (
                <button
                  type="button"
                  onClick={() => handleChange({ ...design, shareImageUrl: '' })}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-all hover:opacity-80"
                  style={{ border: '1px solid #fecaca', color: '#ef4444', backgroundColor: '#fff5f5', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="Trash2" size={12} color="#ef4444" />
                  Quitar
                </button>
              )}
              <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                1200×630 px · horizontal
              </span>
            </div>

            <input
              ref={shareInputRef}
              type="file"
              accept="image/*"
              onChange={handleShareImageUpload}
              className="hidden"
            />
          </div>
        );
      })()}

      {/* 4. Store Logo */}
      <SectionCard icon="CircleUser" title="Logo de la tienda" subtitle="Aparece centrado en el encabezado, sobre el nombre de la tienda">
        <div className="flex items-center gap-6">
          {/* Logo preview */}
          <div
            className="relative w-24 h-24 rounded-full overflow-hidden border-2 flex items-center justify-center group cursor-pointer flex-shrink-0 transition-all"
            style={{
              borderColor: design?.logoUrl ? primaryColor : 'var(--color-border)',
              backgroundColor: '#f0f0f8',
              boxShadow: design?.logoUrl ? `0 0 0 3px ${primaryColor}20` : 'none',
            }}
            onClick={() => logoInputRef?.current?.click()}
          >
            {design?.logoUrl ? (
              <>
                <Image key={design?.logoUrl} src={design?.logoUrl} alt="Logo de la tienda" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5"
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                >
                  <Icon name="Camera" size={18} color="#fff" />
                  <span className="text-[10px] text-white font-medium" style={{ fontFamily: 'var(--font-caption)' }}>Cambiar</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                {uploadingLogo ? (
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(139,92,246,0.2)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <Icon name="Store" size={24} color="#a0a0b8" />
                )}
                <span className="text-xs text-center" style={{ color: '#a0a0b8', fontFamily: 'var(--font-caption)', fontSize: '9px' }}>Sin logo</span>
              </div>
            )}
          </div>
          {/* Logo actions */}
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              El logo aparece en un contenedor circular centrado sobre el nombre de la tienda.
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              Si no hay logo, se muestra el ícono predeterminado.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                onClick={() => logoInputRef?.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80 disabled:opacity-50"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: '#ffffff', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Upload" size={12} color="var(--color-text-secondary)" />
                {uploadingLogo ? 'Subiendo...' : design?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
              </button>
              {design?.logoUrl && (
                <button
                  onClick={() => handleChange({ ...design, logoUrl: '' })}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                  style={{ border: '1px solid #fecaca', color: '#ef4444', backgroundColor: '#fff5f5', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="Trash2" size={12} color="#ef4444" />
                  Eliminar logo
                </button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <DesignUnifiedHeading title="Estilo del catálogo" subtitle="Sombra y espaciado de las tarjetas de producto" />

      {/* 4. Catalog Style Selector */}
      <SectionCard icon="Layers" title="Estilo de tarjetas" subtitle="Ajusta la presentación visual de las tarjetas de producto">
        <div className="grid grid-cols-3 gap-3">
          {CATALOG_STYLES?.map(style => (
            <button
              key={style?.id}
              onClick={() => handleChange({ ...design, catalogStyle: style?.id })}
              className="relative flex flex-col gap-2 p-3 rounded-xl border-2 transition-all text-left"
              style={{
                borderColor: selectedStyle === style?.id ? primaryColor : 'var(--color-border)',
                backgroundColor: selectedStyle === style?.id ? `${primaryColor}08` : '#fafafa',
              }}
            >
              {selectedStyle === style?.id && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Icon name="Check" size={11} color="#fff" />
                </div>
              )}
              <StyleMiniCard style={style} primaryColor={primaryColor} isSelected={selectedStyle === style?.id} />
              <div>
                <p
                  className="text-xs font-bold"
                  style={{ color: selectedStyle === style?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}
                >
                  {style?.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                  {style?.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <CatalogLayoutSettings
        design={design}
        onChange={handleChange}
      />

      <DesignUnifiedHeading title="Opciones avanzadas" subtitle="Tema y tipografía" />

      <SectionCard icon="Settings2" title="Tema y tipografía" subtitle="Tema de color global y fuente del catálogo">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tema de color</p>
            <div className="grid grid-cols-3 gap-3">
              {THEMES?.map(theme => (
                <button
                  key={theme?.id}
                  type="button"
                  onClick={() => handleChange({ ...design, theme: theme?.id })}
                  className="relative flex flex-col gap-2 p-3 rounded-xl border-2 transition-all text-left"
                  style={{
                    borderColor: selectedTheme === theme?.id ? primaryColor : 'var(--color-border)',
                    backgroundColor: selectedTheme === theme?.id ? `${primaryColor}08` : '#fafafa',
                  }}
                >
                  {selectedTheme === theme?.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                      <Icon name="Check" size={11} color="#fff" />
                    </div>
                  )}
                  <ThemeMiniPreview theme={theme} primaryColor={primaryColor} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: selectedTheme === theme?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{theme?.label}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{theme?.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tipografía</p>
            <div className="flex flex-col gap-2">
              {FONTS?.map(font => (
                <button
                  key={font?.id}
                  type="button"
                  onClick={() => handleChange({ ...design, font: font?.id })}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left"
                  style={{
                    borderColor: selectedFont === font?.id ? primaryColor : 'var(--color-border)',
                    backgroundColor: selectedFont === font?.id ? `${primaryColor}08` : '#fafafa',
                  }}
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs font-semibold" style={{ color: selectedFont === font?.id ? primaryColor : 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>{font?.label}</span>
                    <div className="flex flex-col gap-0.5" style={{ fontFamily: `'${font?.id}', sans-serif`, color: 'var(--color-text-primary)' }}>
                      <span className="text-sm font-semibold leading-tight">{FONT_PREVIEW_LINES.sample}</span>
                      <span className="text-xs leading-snug">{FONT_PREVIEW_LINES.body}</span>
                    </div>
                  </div>
                  {selectedFont === font?.id && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ml-2" style={{ backgroundColor: primaryColor }}>
                      <Icon name="Check" size={11} color="#fff" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {!hideSaveButton && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 order-2 sm:order-1">
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            {showSaved
              ? <span style={{ color: '#059669' }}>✓ Diseño guardado correctamente.</span>
              : isDirty
                ? <span style={{ color: '#f59e0b' }}>Tienes cambios sin guardar.</span>
                : 'Presiona "Guardar cambios" para publicar.'}
          </p>
          {isDirty && onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={isSaving}
              className="flex items-center gap-1 text-xs font-medium transition-all disabled:opacity-50"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="RotateCcw" size={10} color="var(--color-text-tertiary)" />
              Restablecer
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || (!isDirty && !showSaved)}
          className="order-1 sm:order-2 flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{
            background: showSaved
              ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
              : `linear-gradient(135deg, ${primaryColor} 0%, #7c3aed 100%)`,
            fontFamily: 'var(--font-caption)',
            boxShadow: isDirty ? `0 2px 8px ${primaryColor}55` : 'none',
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
          ) : showSaved ? (
            <>
              <Icon name="Check" size={14} color="#fff" />
              Guardado ✓
            </>
          ) : (
            <>
              <Icon name="Save" size={14} color="#fff" />
              Guardar diseño
            </>
          )}
        </button>
      </div>
      )}

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

      {/* ── Botón flotante mobile (solo cuando hay cambios o se está guardando) ── */}
      {(isDirty || isSaving || showSaved) && (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || (!isDirty && !showSaved)}
          aria-label={saveLabel}
          className="fixed bottom-20 right-4 z-50 flex md:hidden items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl transition-all active:scale-95 disabled:opacity-60"
          style={{
            background: showSaved
              ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
              : `linear-gradient(135deg, ${primaryColor} 0%, #7c3aed 100%)`,
            fontFamily: 'var(--font-caption)',
            boxShadow: showSaved
              ? '0 4px 20px rgba(5,150,105,0.45)'
              : `0 4px 20px ${primaryColor}60`,
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
          ) : showSaved ? (
            <>
              <Icon name="Check" size={14} color="#fff" />
              Guardado
            </>
          ) : (
            <>
              <Icon name="Save" size={14} color="#fff" />
              Guardar
            </>
          )}
        </button>
      )}
    </div>
  );
}
