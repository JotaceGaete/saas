import React from 'react';
import Image from 'components/AppImage';
import Icon from 'components/AppIcon';
import { formatCLP } from 'utils/formatCLP';

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

function ProductListItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps }) {
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
            {formatCLP(product?.price)}
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

function ProductGridItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps }) {
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
            {formatCLP(product?.price)}
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

function ProductCardItem({ product, t, primaryColor, fontFamily, cardSettings, styleProps }) {
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
              {formatCLP(product?.price)}
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

export default function MobilePreviewPanel({ storeName, storeSlug, logoUrl, coverImageUrl, products, currency, design }) {
  const visibleProducts = products?.slice(0, 4) || [];

  const theme = design?.theme || 'minimal';
  const primaryColor = design?.primaryColor || '#7C3AED';
  const font = design?.font || 'Inter';
  const designLogoUrl = design?.logoUrl || logoUrl;
  const headerImageUrl = (coverImageUrl && coverImageUrl.trim()) ? coverImageUrl.trim() : (design?.headerImageUrl || '');
  const coverFit = design?.coverFit === 'contain' ? 'contain' : 'cover';
  const coverPosition = ['top', 'center', 'bottom'].includes(design?.coverPosition) ? design.coverPosition : 'center';
  const catalogLayout = design?.catalogLayout || 'list';
  const catalogViewMode = design?.catalogViewMode === 'compact' ? 'compact' : 'featured';
  const catalogStyle = design?.catalogStyle || 'clasico';
  const cardSettings = design?.cardSettings || { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true };
  const previewLayout = catalogViewMode === 'compact' ? 'grid' : catalogLayout;

  const t = THEME_STYLES?.[theme] || THEME_STYLES?.minimal;
  const styleProps = CATALOG_STYLE_PROPS?.[catalogStyle] || CATALOG_STYLE_PROPS?.clasico;
  const fontFamily = `'${font}', sans-serif`;

  const isGradientHeader = t?.headerBg === 'gradient';
  const headerBgStyle = isGradientHeader
    ? { background: `linear-gradient(135deg, ${primaryColor} 0%, #4F46E5 100%)` }
    : { backgroundColor: t?.headerBg };

  const productItemProps = { t, primaryColor, fontFamily, cardSettings, styleProps };

  return (
    <div className="flex flex-col items-center">
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-5"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', letterSpacing: '0.1em' }}
      >
        Vista previa móvil
      </p>

      {/* Phone frame */}
      <div
        className="relative rounded-[2.5rem] overflow-hidden"
        style={{
          width: '260px',
          height: '520px',
          border: '8px solid #1a1a2e',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.1)',
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

          {/* Cover image banner */}
          {headerImageUrl ? (
            <div
              className="relative w-full overflow-hidden"
              style={{
                height: '72px',
                backgroundColor: coverFit === 'contain' ? (primaryColor || '#7C3AED') : undefined,
              }}
            >
              <Image
                src={headerImageUrl}
                alt="Portada del catálogo en vista previa"
                className="w-full h-full"
                style={{
                  objectFit: coverFit,
                  objectPosition: coverFit === 'cover' ? coverPosition : 'center',
                }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 100%)' }} />
              {/* Logo overlaid on cover */}
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
