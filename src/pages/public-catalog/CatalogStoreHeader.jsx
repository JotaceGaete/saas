/**
 * CatalogStoreHeader — bloque de identidad del negocio compartido entre
 * el catálogo principal (/catalogo/:slug) y la página de ofertas (/catalogo/:slug/ofertas).
 *
 * Replica los tres templates de escritorio (cover, split, compact), el banner
 * mobile, la tarjeta de identidad con acordeón, las redes sociales y la barra
 * de info (horarios, envíos, retiro).
 *
 * Props:
 *   business     — objeto de negocio completo (mapBusinessFromDb)
 *   theme        — resultado completo de resolveCatalogTheme(design)
 *   slug         — slug del negocio (para tracking de WhatsApp)
 *   isDesktop    — desde useIsDesktop()
 *   badgeLabel   — texto del pill de estado (default: 'Activa')
 *   onBack       — callback para el botón ← en móvil; null = solo espaciador
 */
import React, { useState, useEffect } from 'react';
import Icon from '../../components/AppIcon';
import { buildCfImageErrorHandler, cfImageUrl } from '../../utils/cloudflareImage';
import { useResponsiveCfImageProfile } from '../../hooks/useResponsiveCfImageProfile';
import { recordCatalogWhatsAppClick } from '../../services/waBusinessService';
import { getPublicCatalogRelativePath } from '../../config/appUrl';
import { normalizeTikTokUrl } from '../../utils/socialLinks';
import { isRestaurantBusiness } from '../../utils/businessType';

// ─── Bloques de info reutilizados en acordeón mobile y barra desktop ──────────

function CatalogInfoBlock({ icon, title, children, sectionBg, borderColor, textColor, isDark }) {
  const bg = sectionBg ?? 'rgba(0,0,0,0.018)';
  const border = borderColor ?? '#e5e7eb';
  const iconBg = isDark ? 'rgba(255,255,255,0.08)' : '#ffffff';
  const iconColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : '#6B7280';
  const valueColor = textColor ?? '#1F2937';
  return (
    <div className="flex gap-3 rounded-xl p-3 sm:p-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-sm" style={{ background: iconBg, border: `1px solid ${border}` }}>
        <Icon name={icon} size={18} color={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide" style={{ color: labelColor }}>{title}</span>
        <div className="text-sm font-normal leading-relaxed" style={{ color: valueColor }}>{children}</div>
      </div>
    </div>
  );
}

function CatalogInfoGrid({ design, primaryColor, fullAddress, mapsSearchUrl, showAddressInCatalog, theme }) {
  const blockProps = {
    sectionBg: theme?.sectionBg,
    borderColor: theme?.borderColor,
    textColor: theme?.textColor,
    isDark: theme?.isDark,
  };
  return (
    <>
      {(design?.businessHours ?? '').trim() !== '' && (
        <CatalogInfoBlock icon="Clock" title="Horario" {...blockProps}>
          <span className="whitespace-pre-line">{design.businessHours.trim()}</span>
        </CatalogInfoBlock>
      )}
      {showAddressInCatalog && (
        <CatalogInfoBlock icon="MapPin" title="Dirección" {...blockProps}>
          {mapsSearchUrl ? (
            <>
              <a href={mapsSearchUrl} target="_blank" rel="noopener noreferrer" className="hover:underline focus:outline-none focus:underline" style={{ color: primaryColor }}>
                {fullAddress}
              </a>
              <span className="block mt-1.5">
                <a href={mapsSearchUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline" style={{ color: primaryColor }}>
                  Ver en mapa
                </a>
              </span>
            </>
          ) : (
            <span>{fullAddress}</span>
          )}
        </CatalogInfoBlock>
      )}
      {(design?.shippingMethods ?? '').trim() !== '' && (
        <CatalogInfoBlock icon="Truck" title="Envíos" {...blockProps}>
          {design.shippingMethods.trim()}
        </CatalogInfoBlock>
      )}
      {(design?.shippingCost ?? '').trim() !== '' && (
        <CatalogInfoBlock icon="Package" title="Costo de envío" {...blockProps}>
          {design.shippingCost.trim()}
        </CatalogInfoBlock>
      )}
      {design?.retiroEnTienda === true && (
        <div className="sm:col-span-2">
          <CatalogInfoBlock icon="Store" title="Retiro en tienda" {...blockProps}>
            Disponible
          </CatalogInfoBlock>
        </div>
      )}
    </>
  );
}

function SocialLinks({ business, primaryColor, theme }) {
  const normalizedTikTokUrl = normalizeTikTokUrl(business?.tiktokUrl);
  const links = [
    {
      key: 'instagram',
      url: business?.instagramUrl,
      label: 'Instagram',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
        </svg>
      ),
    },
    {
      key: 'tiktok',
      url: normalizedTikTokUrl,
      label: 'TikTok',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
        </svg>
      ),
    },
    {
      key: 'facebook',
      url: business?.facebookUrl,
      label: 'Facebook',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      ),
    },
  ].filter((l) => l.url);

  if (links.length === 0) return null;

  const sectionBg   = theme?.sectionBg   ?? 'rgba(0,0,0,0.018)';
  const borderColor = theme?.borderColor ?? '#e5e7eb';
  const chipBg      = theme?.chipBg      ?? 'rgba(0,0,0,0.07)';
  const chipText    = theme?.chipText    ?? primaryColor;
  const mutedColor  = theme?.isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  return (
    <div className="max-w-5xl mx-auto px-4 mt-3">
      <div className="rounded-xl shadow-sm px-4 sm:px-5 py-4" style={{ background: sectionBg, border: `1px solid ${borderColor}` }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: mutedColor }}>Síguenos</p>
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.key}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-150 active:scale-[0.97]"
              style={{ background: chipBg, border: `1px solid ${borderColor}`, color: chipText }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = primaryColor;
                e.currentTarget.style.borderColor = primaryColor;
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = chipBg;
                e.currentTarget.style.borderColor = borderColor;
                e.currentTarget.style.color = chipText;
              }}
            >
              <span className="flex-shrink-0 opacity-80">{l.icon}</span>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CatalogStoreHeader({
  business,
  theme,
  slug,
  isDesktop,
  badgeLabel = 'Activa',
  onBack = null,
}) {
  const [mobileStoreInfoOpen, setMobileStoreInfoOpen] = useState(false);
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false);
  const cfCoverProfile = useResponsiveCfImageProfile();

  // Reset accordion when slug changes
  useEffect(() => { setMobileStoreInfoOpen(false); }, [slug]);

  const design = business?.designSettings || {};
  const primaryColor     = theme?.primaryColor     || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba      = theme?.primaryRgba      || (() => 'rgba(37,211,102,0.35)');

  const storeHeader = { showStoreName: true, showDescription: true, showWhatsAppButton: true, ...design?.storeHeader };
  const isRestaurant = isRestaurantBusiness(business);

  const headerTemplate = (() => {
    const t = design?.headerTemplate;
    if (t === 'cover' || t === 'split' || t === 'compact') return t;
    if (business?.coverImageUrl) return 'cover';
    if (business?.description?.trim()) return 'split';
    return 'compact';
  })();

  const coverPositionY = design?.coverPositionY ?? 50;
  const coverObjectPosition = `50% ${coverPositionY}%`;

  const whatsappPhone = business?.whatsapp?.replace(/\D/g, '');
  const storeWhatsAppUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent('Hola! Vi tu catálogo en línea.')}`
    : null;

  const fullAddress = [business?.address, business?.city, business?.region, business?.country].filter(Boolean).join(', ');
  const mapsSearchUrl = fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : '';
  const showAddressInCatalog = design?.showAddress === true && fullAddress;

  const hasCatalogInfo =
    (design?.businessHours ?? '').trim() !== '' ||
    showAddressInCatalog ||
    (design?.shippingMethods ?? '').trim() !== '' ||
    (design?.shippingCost ?? '').trim() !== '' ||
    design?.retiroEnTienda === true;

  const hasBusinessDescription = storeHeader?.showDescription !== false && !!business?.description?.trim();
  const hasMobileStoreInfoAccordion = hasBusinessDescription || hasCatalogInfo || !!business?.city;

  const handleWaClick = () => {
    const path = typeof window !== 'undefined'
      ? window.location?.pathname || getPublicCatalogRelativePath(slug)
      : getPublicCatalogRelativePath(slug);
    recordCatalogWhatsAppClick(slug, path, 'store_header').catch(() => {});
  };

  return (
    <>
      {/* ── Cabecera fija móvil ── */}
      <header
        className="fixed left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm md:hidden"
        role="banner"
        style={{ top: 0, paddingTop: 'var(--safe-area-top)', minHeight: 'calc(56px + var(--safe-area-top))' }}
      >
        <div className="flex items-center h-14 px-4 gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Volver"
            >
              <Icon name="ArrowLeft" size={22} color="currentColor" />
            </button>
          ) : (
            <div className="w-10 h-10 flex-shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            {business?.logoUrl ? (
              <img
                src={cfImageUrl(business.logoUrl, 'thumbnail')}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                onError={buildCfImageErrorHandler(business.logoUrl)}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
              >
                <Icon name="Store" size={16} color="#FFFFFF" />
              </div>
            )}
            <span className="font-bold text-gray-900 truncate text-base tracking-tight">{business?.name}</span>
          </div>
        </div>
      </header>

      {/* ── Contenido del header ── */}
      <div className="pt-[calc(3.5rem+var(--safe-area-top))] md:pt-0">

        {/* Desktop: compact ─────────────────────────────────────────────────── */}
        {headerTemplate === 'compact' && (
          <div className="hidden md:block" style={{ borderBottom: `1px solid ${theme?.borderColor ?? '#e5e7eb'}` }}>
            <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center gap-4">
              <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: primaryColor }} />
              {business?.logoUrl ? (
                <img
                  src={cfImageUrl(business.logoUrl, 'thumbnail')}
                  alt={business?.name}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  onError={buildCfImageErrorHandler(business.logoUrl)}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                >
                  <Icon name="Store" size={18} color="#ffffff" />
                </div>
              )}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <h1 className="text-lg font-bold truncate tracking-tight" style={{ color: theme?.textColor ?? '#111111' }}>{business?.name}</h1>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                  style={{ background: theme?.chipBg ?? 'rgba(0,0,0,0.07)', color: theme?.isDark ? primaryColor : primaryColorDark }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
                  {badgeLabel}
                </span>
                {isRestaurant && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(234,88,12,0.1)', color: '#C2410C' }}
                  >
                    <Icon name="UtensilsCrossed" size={10} color="#C2410C" />
                    Menú
                  </span>
                )}
                {business?.city && (
                  <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF' }}>
                    <Icon name="MapPin" size={11} color={theme?.isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF'} />
                    {business.city}
                  </span>
                )}
              </div>
              {storeHeader?.showWhatsAppButton !== false && storeWhatsAppUrl && (
                <a
                  href={storeWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWaClick}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                >
                  <Icon name="MessageCircle" size={15} color="#ffffff" />
                  Contactar
                </a>
              )}
            </div>
          </div>
        )}

        {/* Desktop: split ───────────────────────────────────────────────────── */}
        {headerTemplate === 'split' && (
          <div className="hidden md:flex overflow-hidden" style={{ minHeight: '240px' }}>
            <div
              className="flex-1 flex flex-col justify-center px-8 py-8 min-w-0"
              style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)` }}
            >
              <div className="flex items-center gap-4 mb-3">
                {business?.logoUrl ? (
                  <img
                    src={cfImageUrl(business.logoUrl, 'thumbnail')}
                    alt={business?.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-white/30 flex-shrink-0"
                    onError={buildCfImageErrorHandler(business.logoUrl)}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-white/30 bg-white/20 flex-shrink-0">
                    <Icon name="Store" size={24} color="#ffffff" />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-white leading-tight tracking-tight">{business?.name}</h1>
                  {business?.city && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Icon name="MapPin" size={12} color="rgba(255,255,255,0.65)" />
                      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{business.city}</span>
                    </div>
                  )}
                </div>
              </div>
              {business?.description?.trim() && (
                <p className="text-sm leading-relaxed line-clamp-3 mb-5" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  {business.description.trim()}
                </p>
              )}
              {storeHeader?.showWhatsAppButton !== false && storeWhatsAppUrl && (
                <a
                  href={storeWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleWaClick}
                  className="self-start flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-white/20 hover:bg-white/30 transition-colors border border-white/25 active:scale-[0.98]"
                >
                  <Icon name="MessageCircle" size={15} color="#ffffff" />
                  Contactar por WhatsApp
                </a>
              )}
            </div>
            <div className="w-[42%] flex-shrink-0 relative overflow-hidden">
              {business?.coverImageUrl ? (
                <img
                  src={cfImageUrl(business.coverImageUrl, cfCoverProfile)}
                  alt=""
                  role="presentation"
                  className="absolute inset-0 w-full h-full"
                  style={{ objectFit: 'cover', objectPosition: coverObjectPosition }}
                  onError={buildCfImageErrorHandler(business.coverImageUrl)}
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(160deg, ${primaryColorDark}cc 0%, ${primaryColor}55 60%, ${primaryColorDark}88 100%)` }}
                />
              )}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-16"
                style={{ background: `linear-gradient(to right, ${primaryColor}, transparent)` }}
              />
            </div>
          </div>
        )}

        {/* Banner — siempre en móvil; en desktop solo para template cover ────── */}
        <div
          className={`relative w-full overflow-hidden aspect-[16/7] md:aspect-[21/5]${headerTemplate !== 'cover' ? ' md:hidden' : ''}`}
          style={{
            background: !business?.coverImageUrl
              ? `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 50%, ${primaryColorDark} 100%)`
              : undefined,
          }}
        >
          {business?.coverImageUrl && (
            <>
              <img
                src={cfImageUrl(business.coverImageUrl, cfCoverProfile)}
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: 'cover', objectPosition: coverObjectPosition, filter: 'blur(14px)', transform: 'scale(1.15)', opacity: 0.75 }}
                onError={buildCfImageErrorHandler(business.coverImageUrl)}
              />
              <img
                src={cfImageUrl(business.coverImageUrl, cfCoverProfile)}
                alt=""
                role="presentation"
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: 'cover', objectPosition: coverObjectPosition }}
                onError={buildCfImageErrorHandler(business.coverImageUrl)}
              />
            </>
          )}
        </div>

        {/* Tarjeta de identidad — móvil siempre; desktop solo para template cover */}
        <div className={`max-w-5xl mx-auto px-4 -mt-6 sm:-mt-8 md:-mt-14 relative z-10${headerTemplate !== 'cover' ? ' md:hidden' : ''}`}>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  {business?.logoUrl ? (
                    <img
                      src={cfImageUrl(business.logoUrl, 'thumbnail')}
                      alt={business?.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-gray-100"
                      onError={buildCfImageErrorHandler(business.logoUrl)}
                    />
                  ) : (
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-gray-100"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                    >
                      <Icon name="Store" size={28} color="#FFFFFF" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {storeHeader?.showStoreName !== false && (
                      <h1 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">
                        {business?.name}
                      </h1>
                    )}
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                      style={{ background: primaryRgba(0.12), color: primaryColorDark }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
                      {badgeLabel}
                    </span>
                    {isRestaurant && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'rgba(234,88,12,0.1)', color: '#C2410C' }}
                      >
                        <Icon name="UtensilsCrossed" size={10} color="#C2410C" />
                        Menú
                      </span>
                    )}
                  </div>
                  {business?.city && (
                    <div className="hidden md:flex items-center gap-1 mb-1">
                      <Icon name="MapPin" size={12} color="#9CA3AF" />
                      <span className="text-xs text-gray-500">{business?.city}</span>
                    </div>
                  )}
                  {storeHeader?.showDescription !== false && business?.description && (
                    <p
                      className="hidden md:block text-[15px] sm:text-base font-normal leading-relaxed line-clamp-5 mt-1 text-pretty"
                      style={{ color: storeHeader?.descriptionColor || '#374151' }}
                    >
                      {business?.description}
                    </p>
                  )}
                </div>
              </div>

              {storeHeader?.showWhatsAppButton !== false && storeWhatsAppUrl && (
                <div className="flex-shrink-0 md:pl-4 w-full md:w-auto">
                  <a
                    href={storeWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleWaClick}
                    className="inline-flex items-center justify-center gap-2 w-full md:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`,
                      boxShadow: `0 2px 10px ${primaryRgba(0.35)}`,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Contactar
                  </a>
                </div>
              )}
            </div>

            {/* Acordeón móvil: datos del negocio */}
            {hasMobileStoreInfoAccordion && (
              <div className="md:hidden border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setMobileStoreInfoOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-gray-800 active:bg-gray-50/90 transition-colors duration-200"
                  aria-expanded={mobileStoreInfoOpen}
                  aria-controls="store-header-mobile-info"
                  id="store-header-mobile-info-trigger"
                >
                  <span>{mobileStoreInfoOpen ? 'Ocultar datos del negocio' : 'Ver datos del negocio'}</span>
                  <Icon
                    name="ChevronDown"
                    size={20}
                    color="#6B7280"
                    className={`flex-shrink-0 transition-transform duration-300 ease-out ${mobileStoreInfoOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                <div
                  id="store-header-mobile-info"
                  role="region"
                  aria-labelledby="store-header-mobile-info-trigger"
                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${mobileStoreInfoOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="px-4 pb-4 pt-0 border-t border-gray-50">
                      <div className="grid grid-cols-1 gap-3 text-sm pt-4">
                        {hasBusinessDescription && (
                          <div className="flex items-start gap-2">
                            <Icon name="AlignLeft" size={16} className="flex-shrink-0 mt-0.5" color="#6B7280" />
                            <div className="min-w-0">
                              <span className="font-semibold text-gray-500 block mb-0.5">Descripción</span>
                              <p
                                className="text-gray-800 leading-relaxed text-[15px] font-normal text-pretty"
                                style={{ color: storeHeader?.descriptionColor || '#374151' }}
                              >
                                {business?.description}
                              </p>
                            </div>
                          </div>
                        )}
                        {business?.city && !showAddressInCatalog && (
                          <div className="flex items-start gap-2">
                            <Icon name="MapPin" size={16} className="flex-shrink-0 mt-0.5" color="#6B7280" />
                            <div>
                              <span className="font-semibold text-gray-500 block mb-0.5">Ubicación</span>
                              <span className="text-gray-800">{business.city}</span>
                            </div>
                          </div>
                        )}
                        <CatalogInfoGrid
                          design={design}
                          primaryColor={primaryColor}
                          fullAddress={fullAddress}
                          mapsSearchUrl={mapsSearchUrl}
                          showAddressInCatalog={showAddressInCatalog}
                          theme={theme}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Redes sociales */}
        <SocialLinks business={business} primaryColor={primaryColor} theme={theme} />

        {/* Barra de info (escritorio, colapsada por defecto) */}
        {hasCatalogInfo && (
          <div className="max-w-5xl mx-auto px-4 mt-3 hidden md:block">
            <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: theme?.sectionBg ?? 'rgba(0,0,0,0.018)', border: `1px solid ${theme?.borderColor ?? '#e5e7eb'}` }}>
              <button
                type="button"
                onClick={() => setDesktopInfoOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{ '--tw-ring-color': primaryColor }}
                aria-expanded={desktopInfoOpen}
                aria-controls="store-header-desktop-info"
              >
                <div className="flex items-center gap-4 flex-wrap min-w-0">
                  {(design?.businessHours ?? '').trim() !== '' && (
                    <span className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                      <Icon name="Clock" size={13} color={theme?.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'} aria-hidden />
                      <span className="truncate">{design.businessHours.trim().split('\n')[0].trim()}</span>
                    </span>
                  )}
                  {showAddressInCatalog && business?.city && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                      <Icon name="MapPin" size={13} color={theme?.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'} aria-hidden />
                      {business.city}
                    </span>
                  )}
                  {(design?.shippingMethods ?? '').trim() !== '' && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                      <Icon name="Truck" size={13} color={theme?.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'} aria-hidden />
                      Envíos
                    </span>
                  )}
                  {design?.retiroEnTienda === true && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                      <Icon name="Store" size={13} color={theme?.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'} aria-hidden />
                      Retiro en tienda
                    </span>
                  )}
                </div>
                <span
                  className="flex items-center gap-1 text-xs font-medium shrink-0 transition-colors duration-150"
                  style={{ color: primaryColor }}
                >
                  {desktopInfoOpen ? 'Ocultar' : 'Ver más'}
                  <Icon
                    name="ChevronDown"
                    size={14}
                    color={primaryColor}
                    aria-hidden
                    className={`transition-transform duration-200 ease-out ${desktopInfoOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              <div
                id="store-header-desktop-info"
                role="region"
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${desktopInfoOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="px-4 pb-4 pt-4" style={{ borderTop: `1px solid ${theme?.borderColor ?? '#e5e7eb'}` }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <CatalogInfoGrid
                        design={design}
                        primaryColor={primaryColor}
                        fullAddress={fullAddress}
                        mapsSearchUrl={mapsSearchUrl}
                        showAddressInCatalog={showAddressInCatalog}
                        theme={theme}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
