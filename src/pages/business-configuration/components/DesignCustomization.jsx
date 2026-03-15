import React, { useState, useRef, useEffect } from 'react';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';
import { uploadBusinessLogo, uploadBusinessCover } from '../../../services/waBusinessService';

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
  { id: 'Inter', label: 'Inter', sample: 'El texto de tu tienda se verá así' },
  { id: 'Urbanist', label: 'Urbanist', sample: 'El texto de tu tienda se verá así' },
  { id: 'Poppins', label: 'Poppins', sample: 'El texto de tu tienda se verá así' },
];

const CATALOG_LAYOUTS = [
  { id: 'list', label: 'Lista', description: 'Productos en fila horizontal', icon: 'LayoutList' },
  { id: 'grid', label: 'Cuadrícula', description: 'Productos en 2 columnas', icon: 'LayoutGrid' },
  { id: 'card', label: 'Tarjeta', description: 'Tarjetas grandes con imagen', icon: 'CreditCard' },
];

const CATALOG_VIEW_MODES = [
  { id: 'featured', label: 'Vista destacada', description: '1 columna en móvil, tarjetas grandes, imagen protagonista', icon: 'LayoutGrid' },
  { id: 'compact', label: 'Vista compacta', description: '2 columnas en móvil, tarjetas pequeñas, ideal para muchos productos', icon: 'LayoutList' },
];

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

export default function DesignCustomization({
  design,
  onChange,
  businessId,
  isSaving,
  onSave,
  showToast,
}) {
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const font = design?.font || 'Inter';
    if (font === 'Inter') return;
    const linkId = `gfont-${font}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font}:wght@400;500;600;700&display=swap`;
    document.head?.appendChild(link);
  }, [design?.font]);

  const handleLogoUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !businessId) return;
    setUploadingLogo(true);
    try {
      const { url, error } = await uploadBusinessLogo(file, businessId);
      if (error) { showToast?.('Error al subir logo', 'error'); return; }
      onChange?.({ ...design, logoUrl: url });
      showToast?.('Logo actualizado', 'success');
    } catch {
      showToast?.('Error inesperado al subir logo', 'error');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef?.current) logoInputRef.current.value = '';
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !businessId) return;
    setUploadingCover(true);
    try {
      const { url, error } = await uploadBusinessCover(file, businessId);
      if (error) { showToast?.('Error al subir imagen de portada', 'error'); return; }
      onChange?.({ ...design, headerImageUrl: url });
      showToast?.('Portada actualizada', 'success');
    } catch {
      showToast?.('Error inesperado al subir imagen', 'error');
    } finally {
      setUploadingCover(false);
      if (coverInputRef?.current) coverInputRef.current.value = '';
    }
  };

  const primaryColor = design?.primaryColor || '#7C3AED';
  const selectedStyle = design?.catalogStyle || 'clasico';
  const selectedTheme = design?.theme || 'minimal';
  const selectedFont = design?.font || 'Inter';
  const selectedLayout = design?.catalogLayout || 'list';
  const selectedViewMode = design?.catalogViewMode || 'featured';
  const cardSettings = design?.cardSettings || { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true };
  const storeHeader = design?.storeHeader || { showStoreName: true, showDescription: true, showWhatsAppButton: true };

  const handleCardSetting = (key, value) => {
    onChange?.({ ...design, cardSettings: { ...cardSettings, [key]: value } });
  };

  const handleStoreHeaderToggle = (key) => {
    onChange?.({ ...design, storeHeader: { ...storeHeader, [key]: !storeHeader?.[key] } });
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {/* Section heading */}
      <div className="flex items-center gap-3 pb-1">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryColor}20 0%, ${primaryColor}10 100%)` }}
        >
          <Icon name="Palette" size={20} color={primaryColor} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
            Apariencia del catálogo
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Personaliza cómo se ve tu tienda para tus clientes
          </p>
        </div>
      </div>

      {/* 1. Primary Color */}
      <SectionCard icon="Droplets" title="Color principal" subtitle="Se aplica a botones, badges y acentos de tu catálogo" accent={primaryColor}>
        <div className="flex flex-wrap items-center gap-3">
          {COLORS?.map(color => (
            <button
              key={color?.value}
              onClick={() => onChange?.({ ...design, primaryColor: color?.value })}
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
                onChange={e => onChange?.({ ...design, primaryColor: e?.target?.value })}
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
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: primaryColor, fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Plus" size={11} color="#fff" />
            Agregar
          </div>
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: primaryColor, fontFamily: 'var(--font-caption)', fontSize: '10px' }}
          >
            Activo
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #6D28D9 100%)`, fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="ShoppingCart" size={11} color="#fff" />
            Ver pedido
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Vista previa de elementos
          </span>
        </div>
      </SectionCard>

      {/* 2. Cover Image */}
      <SectionCard icon="Image" title="Imagen de portada" subtitle="Banner que aparece en la parte superior de tu catálogo público">
        <div className="flex flex-col gap-3">
          <div
            className="relative rounded-xl overflow-hidden border-2 flex items-center justify-center group cursor-pointer transition-all hover:border-violet-400"
            style={{
              borderColor: design?.headerImageUrl ? primaryColor : 'var(--color-border)',
              backgroundColor: (design?.headerImageUrl && (design?.coverFit || 'cover') === 'contain') ? (primaryColor || '#f0f0f8') : '#f0f0f8',
              aspectRatio: '16/5',
              minHeight: '80px',
            }}
            onClick={() => coverInputRef?.current?.click()}
          >
            {design?.headerImageUrl ? (
              <>
                <Image
                  src={design?.headerImageUrl}
                  alt="Imagen de portada del catálogo"
                  className="w-full h-full"
                  style={{
                    objectFit: (design?.coverFit || 'cover') === 'contain' ? 'contain' : 'cover',
                    objectPosition: (design?.coverFit || 'cover') === 'cover' ? (design?.coverPosition || 'center') : 'center',
                  }}
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
                <span className="text-xs" style={{ color: '#c0c0d0', fontFamily: 'var(--font-caption)' }}>Recomendado: 1200×400px</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
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
                onClick={() => onChange?.({ ...design, headerImageUrl: '' })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                style={{ border: '1px solid #fecaca', color: '#ef4444', backgroundColor: '#fff5f5', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Trash2" size={12} color="#ef4444" />
                Quitar
              </button>
            )}
          </div>
          {/* Ajuste de visualización del banner */}
          {design?.headerImageUrl && (
            <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Visualización del banner</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="coverFit"
                    checked={(design?.coverFit || 'cover') === 'cover'}
                    onChange={() => onChange?.({ ...design, coverFit: 'cover' })}
                    className="rounded-full border-2"
                    style={{ borderColor: 'var(--color-border)', accentColor: primaryColor }}
                  />
                  <span className="text-xs" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>Rellenar banner</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="coverFit"
                    checked={(design?.coverFit || 'cover') === 'contain'}
                    onChange={() => onChange?.({ ...design, coverFit: 'contain' })}
                    className="rounded-full border-2"
                    style={{ borderColor: 'var(--color-border)', accentColor: primaryColor }}
                  />
                  <span className="text-xs" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>Mostrar imagen completa</span>
                </label>
              </div>
              {(design?.coverFit || 'cover') === 'cover' && (
                <>
                  <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Posición de la imagen</p>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { value: 'top', label: 'Arriba' },
                      { value: 'center', label: 'Centro' },
                      { value: 'bottom', label: 'Abajo' },
                    ].map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="coverPosition"
                          checked={(design?.coverPosition || 'center') === value}
                          onChange={() => onChange?.({ ...design, coverPosition: value })}
                          className="rounded-full border-2"
                          style={{ borderColor: 'var(--color-border)', accentColor: primaryColor }}
                        />
                        <span className="text-xs" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* 2b. Usar categorías en el catálogo (opcional) */}
      <SectionCard icon="Tags" title="Categorías en el catálogo" subtitle="Activa para mostrar filtros por categoría. Las categorías dependen del rubro que elijas en Configuración.">
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
            style={{
              width: '40px',
              height: '22px',
              backgroundColor: design?.useCategories ? primaryColor : '#d1d5db',
            }}
            onClick={(e) => { e.preventDefault(); onChange?.({ ...design, useCategories: !design?.useCategories }); }}
          >
            <div
              className="absolute top-0.5 rounded-full bg-white transition-all"
              style={{
                width: '18px',
                height: '18px',
                left: design?.useCategories ? '20px' : '2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </label>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
          Asigna un <strong>rubro principal</strong> en la pestaña Configuración. Las categorías disponibles se definen por ese rubro (ej. Ropa, Ferretería).
        </p>
      </SectionCard>

      {/* 3. Store Logo */}
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
                <Image src={design?.logoUrl} alt="Logo de la tienda" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                >
                  <Icon name="Camera" size={18} color="#fff" />
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
            <div className="flex gap-2 mt-1">
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
                  onClick={() => onChange?.({ ...design, logoUrl: '' })}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                  style={{ border: '1px solid #fecaca', color: '#ef4444', backgroundColor: '#fff5f5', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="Trash2" size={12} color="#ef4444" />
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 4. Catalog Style Selector */}
      <SectionCard icon="Layers" title="Estilo del catálogo" subtitle="Ajusta la presentación visual de las tarjetas de producto">
        <div className="grid grid-cols-3 gap-3">
          {CATALOG_STYLES?.map(style => (
            <button
              key={style?.id}
              onClick={() => onChange?.({ ...design, catalogStyle: style?.id })}
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

      {/* Vista del catálogo (móvil): destacada vs compacta */}
      <SectionCard icon="Smartphone" title="Vista del catálogo en móvil" subtitle="Elige cómo se muestran los productos en celulares">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATALOG_VIEW_MODES?.map(mode => (
            <button
              key={mode?.id}
              onClick={() => onChange?.({ ...design, catalogViewMode: mode?.id })}
              className="relative flex flex-col gap-2 p-4 rounded-xl border-2 transition-all text-left"
              style={{
                borderColor: selectedViewMode === mode?.id ? primaryColor : 'var(--color-border)',
                backgroundColor: selectedViewMode === mode?.id ? `${primaryColor}08` : '#fafafa',
              }}
            >
              {selectedViewMode === mode?.id && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                  <Icon name="Check" size={11} color="#fff" />
                </div>
              )}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedViewMode === mode?.id ? `${primaryColor}20` : '#f0f0f8' }}>
                <Icon name={mode?.icon} size={18} color={selectedViewMode === mode?.id ? primaryColor : '#a0a0b8'} />
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: selectedViewMode === mode?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
                  {mode?.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                  {mode?.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, #7c3aed 100%)`,
            fontFamily: 'var(--font-caption)',
            boxShadow: `0 2px 8px ${primaryColor}55`,
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
              Guardar apariencia
            </>
          )}
        </button>
      </div>

      {/* Advanced options collapsible */}
      <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 transition-all hover:bg-gray-50"
          style={{ backgroundColor: '#fafafa' }}
        >
          <div className="flex items-center gap-2">
            <Icon name="Settings2" size={15} color="var(--color-text-secondary)" />
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              Opciones avanzadas
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              Tema, tipografía, layout
            </span>
          </div>
          <Icon name={showAdvanced ? 'ChevronUp' : 'ChevronDown'} size={16} color="var(--color-text-tertiary)" />
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-5 p-5 border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: '#ffffff' }}>
            {/* Theme Selector */}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tema de color</p>
              <div className="grid grid-cols-3 gap-3">
                {THEMES?.map(theme => (
                  <button
                    key={theme?.id}
                    onClick={() => onChange?.({ ...design, theme: theme?.id })}
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

            {/* Font Selector */}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tipografía</p>
              <div className="flex flex-col gap-2">
                {FONTS?.map(font => (
                  <button
                    key={font?.id}
                    onClick={() => onChange?.({ ...design, font: font?.id })}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left"
                    style={{
                      borderColor: selectedFont === font?.id ? primaryColor : 'var(--color-border)',
                      backgroundColor: selectedFont === font?.id ? `${primaryColor}08` : '#fafafa',
                    }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold" style={{ color: selectedFont === font?.id ? primaryColor : 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>{font?.label}</span>
                      <span className="text-sm" style={{ fontFamily: `'${font?.id}', sans-serif`, color: 'var(--color-text-primary)' }}>{font?.sample}</span>
                    </div>
                    {selectedFont === font?.id && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: primaryColor }}>
                        <Icon name="Check" size={11} color="#fff" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Layout */}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Diseño del catálogo</p>
              <div className="grid grid-cols-3 gap-3">
                {CATALOG_LAYOUTS?.map(layout => (
                  <button
                    key={layout?.id}
                    onClick={() => onChange?.({ ...design, catalogLayout: layout?.id })}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: selectedLayout === layout?.id ? primaryColor : 'var(--color-border)',
                      backgroundColor: selectedLayout === layout?.id ? `${primaryColor}08` : '#fafafa',
                    }}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedLayout === layout?.id ? `${primaryColor}15` : '#f0f0f8' }}>
                      <Icon name={layout?.icon} size={18} color={selectedLayout === layout?.id ? primaryColor : '#a0a0b8'} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold" style={{ color: selectedLayout === layout?.id ? primaryColor : 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{layout?.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{layout?.description}</p>
                    </div>
                    {selectedLayout === layout?.id && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                        <Icon name="Check" size={9} color="#fff" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Store Header Options */}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Encabezado de la tienda</p>
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
                      style={{
                        width: '40px',
                        height: '22px',
                        backgroundColor: storeHeader?.[item?.key] ? primaryColor : '#d1d5db',
                      }}
                      onClick={() => handleStoreHeaderToggle(item?.key)}
                    >
                      <div
                        className="absolute top-0.5 rounded-full bg-white transition-all"
                        style={{
                          width: '18px',
                          height: '18px',
                          left: storeHeader?.[item?.key] ? '20px' : '2px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </div>
                  </label>
                ))}
              </div>
              {/* Color del texto de la descripción */}
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
                      style={{
                        borderColor: isSelected ? primaryColor : 'var(--color-border)',
                        backgroundColor: isSelected ? `${primaryColor}08` : '#fafafa',
                      }}
                      title={label}
                    >
                      {value ? (
                        <span className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: value }} />
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-gray-300 bg-white" />
                      )}
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Card Settings */}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Tarjeta de producto</p>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'showPrice', label: 'Mostrar precio', icon: 'DollarSign', description: 'Precio del producto' },
                  { key: 'showDescription', label: 'Mostrar descripción', icon: 'AlignLeft', description: 'Texto descriptivo' },
                  { key: 'showStock', label: 'Mostrar stock', icon: 'Package', description: 'Disponibilidad del producto' },
                  { key: 'showWhatsApp', label: 'Botón de WhatsApp', icon: 'MessageCircle', description: 'Botón para contactar' },
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
                      onClick={() => handleCardSetting(item?.key, !cardSettings?.[item?.key])}
                      className="relative flex-shrink-0 transition-all"
                      style={{
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        backgroundColor: cardSettings?.[item?.key] ? primaryColor : '#d1d5db',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <span
                        className="absolute top-0.5 transition-all"
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          left: cardSettings?.[item?.key] ? '22px' : '2px',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
    </div>
  );
}
