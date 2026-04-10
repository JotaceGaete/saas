import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'components/AppImage';
import Icon from 'components/AppIcon';
import { formatCurrency } from 'utils/formatCLP';
import { resolveCatalogTheme } from '../../../utils/catalogTheme';

function formatPreviewPrice(amount, currency, locale, hideSymbol) {
  if (hideSymbol) {
    const n = Number(amount);
    const value = Number.isFinite(n) && n >= 0 ? n : 0;
    return new Intl.NumberFormat(locale || 'en-US', { maximumFractionDigits: 0, useGrouping: true }).format(value);
  }
  return formatCurrency(amount, currency, locale);
}

/** Clave estable para detectar cambios visuales (color, banner, etc.) y disparar el flash en vista previa. */
function buildDesignPreviewFlashKey(design, logoUrl, coverImageUrl) {
  const d = design || {};
  return [
    d.primaryColor,
    d.theme,
    d.template        ?? '',
    d.backgroundColor ?? '',
    d.headerImageUrl  ?? '',
    d.logoUrl         ?? '',
    logoUrl           ?? '',
    coverImageUrl     ?? '',
    d.catalogStyle,
    d.font,
    d.catalogLayout,
    d.catalogViewMode,
    d.cardSettings?.showPrice,
    d.cardSettings?.showDescription,
  ].join('\0');
}

const THEME_STYLES = {
  minimal: {
    screenBg: '#f7f7f9',
    headerBg: '#ffffff',
    headerText: '#1a1a2e',
    headerSubtext: '#8888a8',
    cardBg: '#ffffff',
    cardBorder: '#e8e8f0',
    divider: '#e8e8f0',
    avatarBg: '#e8e8f0',
    emptyBg: '#ebebf5',
    priceColor: null,
  },
  gradient: {
    screenBg: '#f5f3ff',
    headerBg: 'gradient',
    headerText: '#ffffff',
    headerSubtext: 'rgba(255,255,255,0.75)',
    cardBg: '#ffffff',
    cardBorder: '#ede9fe',
    divider: '#ede9fe',
    avatarBg: 'rgba(255,255,255,0.25)',
    emptyBg: '#ebebf5',
    priceColor: null,
  },
  dark: {
    screenBg: '#1a1a2e',
    headerBg: '#16213e',
    headerText: '#ffffff',
    headerSubtext: 'rgba(255,255,255,0.55)',
    cardBg: '#0f3460',
    cardBorder: '#2d2d4e',
    divider: '#2d2d4e',
    avatarBg: 'rgba(255,255,255,0.15)',
    emptyBg: '#2d2d4e',
    priceColor: null,
  },
};

const CATALOG_STYLE_PROPS = {
  clasico: { shadow: '0 2px 8px rgba(0,0,0,0.10)', radius: '10px', gap: '8px', imgHeight: '52px' },
  minimal: { shadow: 'none', radius: '6px', gap: '6px', imgHeight: '44px' },
  destacado: { shadow: '0 4px 16px rgba(0,0,0,0.16)', radius: '14px', gap: '10px', imgHeight: '60px' },
};

function ProductListItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps, currency, locale, hideCurrencySymbol }) {
  return (
    <div
      className="flex items-center gap-2.5 p-2.5 border"
      style={{
        backgroundColor: t?.cardBg,
        borderColor: t?.cardBorder,
        borderRadius: styleProps?.radius,
        boxShadow: styleProps?.shadow,
      }}
    >
      <div
        className="w-11 h-11 overflow-hidden flex-shrink-0"
        style={{ backgroundColor: t?.emptyBg, borderRadius: styleProps?.radius, height: styleProps?.imgHeight, width: styleProps?.imgHeight }}
      >
        {product?.imageUrl || product?.image ? (
          <Image src={product?.imageUrl || product?.image} alt={`Producto ${product?.name}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="ImageOff" size={14} color={t?.cardBorder} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: t?.headerText, fontFamily }}>{product?.name}</p>
        {cardSettings?.showDescription && product?.description && (
          <p className="text-xs truncate" style={{ color: t?.headerSubtext, fontFamily }}>{product?.description}</p>
        )}
        {cardSettings?.showPrice && (
          <p className="text-xs font-bold mt-0.5" style={{ color: t?.priceColor || primaryColor, fontFamily }}>
            {formatPreviewPrice(product?.price, currency, locale, hideCurrencySymbol)}
          </p>
        )}
      </div>
      <div
        className="flex items-center justify-center px-2 py-1 rounded-lg text-white flex-shrink-0"
        style={{ backgroundColor: primaryColor, borderRadius: styleProps?.radius, fontSize: '9px', fontWeight: 700, fontFamily }}
      >
        +
      </div>
    </div>
  );
}

function ProductGridItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps, currency, locale, hideCurrencySymbol }) {
  return (
    <div
      className="overflow-hidden border"
      style={{ backgroundColor: t?.cardBg, borderColor: t?.cardBorder, borderRadius: styleProps?.radius, boxShadow: styleProps?.shadow }}
    >
      <div className="w-full overflow-hidden" style={{ height: styleProps?.imgHeight, backgroundColor: t?.emptyBg }}>
        {product?.imageUrl || product?.image ? (
          <Image src={product?.imageUrl || product?.image} alt={`Producto ${product?.name}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="ImageOff" size={14} color={t?.cardBorder} />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold truncate" style={{ color: t?.headerText, fontFamily }}>{product?.name}</p>
        {cardSettings?.showPrice && (
          <p className="text-xs font-bold" style={{ color: t?.priceColor || primaryColor, fontFamily }}>
            {formatPreviewPrice(product?.price, currency, locale, hideCurrencySymbol)}
          </p>
        )}
        <div
          className="mt-1.5 w-full py-1 flex items-center justify-center"
          style={{ backgroundColor: primaryColor, borderRadius: styleProps?.radius }}
        >
          <span style={{ color: '#fff', fontFamily, fontSize: '9px', fontWeight: 700 }}>Agregar</span>
        </div>
      </div>
    </div>
  );
}

function ProductCardItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps, currency, locale, hideCurrencySymbol }) {
  return (
    <div
      className="overflow-hidden border"
      style={{ backgroundColor: t?.cardBg, borderColor: t?.cardBorder, borderRadius: styleProps?.radius, boxShadow: styleProps?.shadow }}
    >
      <div className="w-full overflow-hidden" style={{ height: styleProps?.imgHeight, backgroundColor: t?.emptyBg }}>
        {product?.imageUrl || product?.image ? (
          <Image src={product?.imageUrl || product?.image} alt={`Producto ${product?.name}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="ImageOff" size={18} color={t?.cardBorder} />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold" style={{ color: t?.headerText, fontFamily }}>{product?.name}</p>
        {cardSettings?.showDescription && product?.description && (
          <p className="text-xs mt-0.5" style={{ color: t?.headerSubtext, fontFamily, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {product?.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-1.5 gap-1">
          {cardSettings?.showPrice && (
            <p className="text-xs font-bold" style={{ color: t?.priceColor || primaryColor, fontFamily }}>
              {formatPreviewPrice(product?.price, currency, locale, hideCurrencySymbol)}
            </p>
          )}
          <div
            className="flex items-center gap-1 px-2 py-1"
            style={{ backgroundColor: primaryColor, borderRadius: styleProps?.radius }}
          >
            <span style={{ color: '#fff', fontFamily, fontSize: '9px', fontWeight: 700 }}>Agregar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MobilePreviewPanel({
  storeName,
  storeSlug,
  logoUrl,
  coverImageUrl,
  products,
  currency,
  locale = 'en-US',
  design,
  /** Si es true, precios numéricos sin símbolo de moneda (vista previa tras fijar país). */
  hideCurrencySymbol = false,
}) {
  const visibleProducts = products?.slice(0, 4) || [];

  const previewFlashKey = useMemo(
    () => buildDesignPreviewFlashKey(design, logoUrl, coverImageUrl),
    [design, logoUrl, coverImageUrl],
  );
  const prevFlashKeyRef = useRef(null);
  const [previewChassisKey, setPreviewChassisKey] = useState(0);

  useEffect(() => {
    if (prevFlashKeyRef.current === null) {
      prevFlashKeyRef.current = previewFlashKey;
      return;
    }
    if (prevFlashKeyRef.current === previewFlashKey) return;
    prevFlashKeyRef.current = previewFlashKey;
    setPreviewChassisKey((k) => k + 1);
  }, [previewFlashKey]);

  const theme = design?.theme || 'minimal';
  const font = design?.font || 'Inter';
  const designLogoUrl = design?.logoUrl || logoUrl;
  const headerImageUrl = (coverImageUrl && coverImageUrl.trim()) ? coverImageUrl.trim() : (design?.headerImageUrl || '');
  const catalogLayout = design?.catalogLayout || 'list';
  const catalogViewMode = design?.catalogViewMode === 'compact' ? 'compact' : 'featured';
  const catalogStyle = design?.catalogStyle || 'clasico';
  const cardSettings = design?.cardSettings || { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true };
  const previewLayout = catalogViewMode === 'compact' ? 'grid' : catalogLayout;

  // Resolve the new template system — drives screenBg, cardBg, borderColor, textColor.
  // THEME_STYLES is kept for header-area props (headerBg gradient, avatarBg, emptyBg)
  // that don't participate in the new template/backgroundColor system.
  const catalogTheme = resolveCatalogTheme(design);
  const primaryColor = catalogTheme.primaryColor;

  const tBase = THEME_STYLES?.[theme] || THEME_STYLES?.minimal;
  const t = {
    ...tBase,
    screenBg:     catalogTheme.bgColor,
    cardBg:       catalogTheme.cardBg,
    cardBorder:   catalogTheme.borderColor,
    divider:      catalogTheme.borderColor,
    headerText:   catalogTheme.textColor,
    headerSubtext: catalogTheme.isDark ? 'rgba(255,255,255,0.55)' : '#8888a8',
  };

  const styleProps = CATALOG_STYLE_PROPS?.[catalogStyle] || CATALOG_STYLE_PROPS?.clasico;
  const fontFamily = `'${font}', sans-serif`;

  const isGradientHeader = t?.headerBg === 'gradient';
  const headerBgStyle = isGradientHeader
    ? { background: `linear-gradient(135deg, ${primaryColor} 0%, #4F46E5 100%)` }
    : { backgroundColor: t?.headerBg };

  const cur = String(currency || 'USD').trim().toUpperCase();
  const loc = locale || 'en-US';
  const productItemProps = { t, primaryColor, fontFamily, cardSettings, styleProps, currency: cur, locale: loc, hideCurrencySymbol };

  return (
    <div className="flex flex-col items-center w-full">
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-5"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', letterSpacing: '0.1em' }}
      >
        Vista previa móvil
      </p>

      {/* Contenedor: fondo neutro + sombra; key + animación al cambiar diseño (color/banner) */}
      <div
        key={previewChassisKey}
        className={`flex flex-col items-center justify-center rounded-3xl p-4 sm:p-8 w-full max-w-[300px] transition-[filter,box-shadow] duration-300 ease-out ${
          previewChassisKey > 0 ? 'animate-preview-update' : ''
        }`}
        style={{
          backgroundColor: '#e8e8ed',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* Marco iPhone: sombra profusa tipo objeto real sobre la mesa */}
        <div className="relative w-full max-w-[260px] mx-auto pt-2">
          <div
            className="pointer-events-none absolute z-20 flex max-w-[calc(100%-4px)] items-center gap-1.5 rounded-full border border-white/30 bg-slate-900/80 py-1 pl-1.5 pr-2 shadow-lg backdrop-blur-md top-0 right-0"
            aria-hidden
          >
            <span className="relative inline-flex h-2 w-2 shrink-0">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
                style={{ animationDuration: '2s' }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.85)]" />
            </span>
            <span
              className="text-[8px] font-bold uppercase leading-none tracking-wide text-white/95"
              style={{ fontFamily: 'var(--font-caption)' }}
            >
              Vista previa en vivo
            </span>
          </div>
          <div
            className="relative overflow-hidden rounded-[2.5rem] flex-shrink-0 w-full mx-auto"
            style={{
              aspectRatio: '260 / 520',
              border: '8px solid #1a1a2e',
              boxShadow: `
                0 2px 4px rgba(0,0,0,0.07),
                0 12px 24px -8px rgba(0,0,0,0.18),
                0 28px 56px -12px rgba(0,0,0,0.22),
                0 48px 96px -24px rgba(0,0,0,0.16),
                inset 0 0 0 1px rgba(255,255,255,0.09)
              `,
              backgroundColor: t?.screenBg,
            }}
          >
        {/* Notch */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 z-10"
          style={{ width: '80px', height: '22px', backgroundColor: '#1a1a2e', borderRadius: '0 0 14px 14px' }}
        />

        {/* Screen content */}
        <div className="h-full overflow-y-auto" style={{ backgroundColor: t?.screenBg }}>

          {/* Cover image banner — smart banner: imagen completa sobre fondo difuminado */}
          {headerImageUrl ? (
            <div className="relative w-full">
              <div className="relative w-full h-[72px] overflow-hidden">
                {/* Capa fondo: blur */}
                <Image
                  src={headerImageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: 'cover',
                    objectPosition: 'center',
                    filter: 'blur(10px)',
                    transform: 'scale(1.15)',
                    opacity: 0.75,
                  }}
                />
                {/* Capa principal: imagen completa */}
                <Image
                  src={headerImageUrl}
                  alt="Portada del catálogo en vista previa"
                  className="absolute inset-0 w-full h-full"
                  style={{ objectFit: 'contain', objectPosition: 'center' }}
                />
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden border-2 flex items-center justify-center"
                  style={{ borderColor: '#ffffff', backgroundColor: t?.avatarBg, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
                >
                  {designLogoUrl ? (
                    <Image src={designLogoUrl} alt={`Logo de ${storeName}`} className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="Store" size={18} color="rgba(255,255,255,0.8)" />
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Store header */}
          <div
            className="flex flex-col items-center pb-4 px-4 relative"
            style={{
              ...(!headerImageUrl ? headerBgStyle : { backgroundColor: t?.screenBg }),
              paddingTop: headerImageUrl ? '32px' : '32px',
            }}
          >
            {/* Logo (only show here if no cover image) */}
            {!headerImageUrl && (
              <div className="relative z-10 flex flex-col items-center mb-2">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center border-2 mb-2"
                  style={{
                    borderColor: isGradientHeader || theme === 'dark' ? 'rgba(255,255,255,0.4)' : '#e0e0ec',
                    backgroundColor: t?.avatarBg,
                  }}
                >
                  {designLogoUrl ? (
                    <Image src={designLogoUrl} alt={`Logo de ${storeName} en vista previa móvil`} className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="Store" size={20} color={isGradientHeader || theme === 'dark' ? 'rgba(255,255,255,0.7)' : '#a0a0b8'} />
                  )}
                </div>
              </div>
            )}
            <p
              className="text-sm font-bold text-center"
              style={{ fontFamily, color: headerImageUrl ? t?.headerText : t?.headerText, letterSpacing: '-0.01em' }}
            >
              {storeName || 'Mi Tienda'}
            </p>
            {storeSlug && (
              <p className="text-xs mt-0.5" style={{ color: t?.headerSubtext, fontFamily }}>@{storeSlug}</p>
            )}
            {/* Active badge */}
            <div
              className="mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
              <span style={{ color: primaryColor, fontSize: '8px', fontWeight: 700, fontFamily }}>Activa</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t mx-4 mb-3" style={{ borderColor: t?.divider }} />

          {/* Product list (vista compacta = 2 cols; vista destacada = según catalogLayout) */}
          <div
            className={previewLayout === 'grid' ? 'grid grid-cols-2 px-3' : 'px-3 flex flex-col'}
            style={{ gap: styleProps?.gap }}
          >
            {visibleProducts?.length === 0 ? (
              <div className={`text-center py-6 ${previewLayout === 'grid' ? 'col-span-2' : ''}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ backgroundColor: t?.emptyBg }}>
                  <Icon name="Package" size={18} color={t?.cardBorder} />
                </div>
                <p className="text-xs" style={{ color: t?.headerSubtext, fontFamily }}>Sin productos</p>
              </div>
            ) : (
              visibleProducts?.map((product) => {
                if (previewLayout === 'grid') {
                  return <ProductGridItem key={product?.id} product={product} {...productItemProps} />;
                }
                if (previewLayout === 'card') {
                  return <ProductCardItem key={product?.id} product={product} {...productItemProps} />;
                }
                return <ProductListItem key={product?.id} product={product} {...productItemProps} />;
              })
            )}
          </div>

          {/* Floating cart bar */}
          {visibleProducts?.length > 0 && (
            <div className="mt-4 px-3 pb-4">
              <div
                className="w-full py-2.5 px-3 flex items-center justify-between text-white"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, #6D28D9 100%)`,
                  fontFamily,
                  borderRadius: styleProps?.radius,
                  boxShadow: styleProps?.shadow,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Icon name="ShoppingCart" size={11} color="#fff" />
                  <span style={{ fontSize: '9px', fontWeight: 700 }}>Ver pedido</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.85 }}>2 productos</span>
              </div>
            </div>
          )}
        </div>
          </div>
      </div>
      </div>

      {/* Style indicator */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }} />
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Estilo: {design?.catalogStyle === 'minimal' ? 'Minimal' : design?.catalogStyle === 'destacado' ? 'Destacado' : 'Clásico'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
          · Vista: {catalogViewMode === 'compact' ? 'Compacta' : 'Destacada'}
        </span>
      </div>

      {/* Home indicator */}
      <div className="mt-2 rounded-full" style={{ width: '80px', height: '4px', backgroundColor: '#1a1a2e', opacity: 0.15 }} />
    </div>
  );
}
