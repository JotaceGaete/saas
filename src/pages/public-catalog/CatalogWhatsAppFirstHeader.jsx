/**
 * CatalogWhatsAppFirstHeader — cabecera para el template "whatsapp_first".
 *
 * Reemplaza la sección hero del catálogo cuando catalogTemplate === 'whatsapp_first'.
 * Muestra una barra sticky de contacto + una sección hero con información del negocio.
 *
 * Props:
 *   business        — objeto de negocio completo
 *   slug            — slug del negocio
 *   theme           — resultado de resolveCatalogTheme(design)
 *   isDesktop       — desde useIsDesktop()
 *   onWhatsAppClick — callback(source) llamado al hacer clic en botones de WhatsApp
 *   onBack          — callback para el botón ← (propietario), null = solo espaciador
 */
import React from 'react';
import Icon from '../../components/AppIcon';
import CatalogImage from '../../components/CatalogImage';
import { cfImageUrl } from '../../utils/cloudflareImage';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import { isRestaurantBusiness } from '../../utils/businessType';

export default function CatalogWhatsAppFirstHeader({
  business,
  slug,
  theme,
  isDesktop,
  onWhatsAppClick,
  onBack = null,
}) {
  const design = business?.designSettings || {};
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const textColor = theme?.textColor || '#111111';
  const bgColor = theme?.bgColor || '#f8f8fb';
  const isRestaurant = isRestaurantBusiness(business);

  const contactName = design?.contactPersonName || business?.name || '';
  const contactPhoto = design?.contactPhotoUrl || null;
  const whatsappPhone = business?.whatsapp?.replace(/\D/g, '');

  const tagline = (() => {
    const raw = String(business?.description || '').trim();
    if (!raw) return '';
    return raw.length > 50 ? `${raw.slice(0, 47).trim()}...` : raw;
  })();

  const storeWhatsAppGreeting = isRestaurant
    ? 'Hola! Quiero hacer un pedido por WhatsApp.'
    : 'Hola! Vi tu catálogo en línea.';

  const storeWhatsAppUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(storeWhatsAppGreeting)}`
    : null;

  const handleBarClick = () => {
    if (!storeWhatsAppUrl) return;
    onWhatsAppClick?.('whatsapp_first_bar');
    openWhatsAppUrl(storeWhatsAppUrl);
  };

  const cityLine = [business?.city, business?.region].filter(Boolean).join(', ');
  const hasDelivery = (design?.shippingMethods ?? '').trim() !== '';
  const hasPickup = design?.retiroEnTienda === true;
  const shippingCost = (design?.shippingCost ?? '').trim();
  const coverUrl = business?.coverImageUrl || null;
  const logoUrl = business?.logoUrl || null;
  const coverPositionY = design?.coverPositionY ?? 50;

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
            {logoUrl ? (
              <CatalogImage
                src={cfImageUrl(logoUrl, 'thumbnail')}
                originalSrc={logoUrl}
                alt=""
                className="w-8 h-8 rounded-full flex-shrink-0"
                imgClassName="w-full h-full rounded-full object-cover"
                variant="logo"
                loading="eager"
                fetchPriority="high"
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

      <div className="pt-[calc(3.5rem+var(--safe-area-top))] md:pt-0">

        {/* ── Barra sticky de contacto WhatsApp ── */}
        {storeWhatsAppUrl && (
          <div
            className="sticky top-[calc(3.5rem+var(--safe-area-top))] md:top-0 z-50 w-full"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
              {/* Indicador "en línea" */}
              <span className="flex-shrink-0 flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: '#ffffff' }}
                />
              </span>

              {/* Foto de contacto */}
              {contactPhoto ? (
                <img
                  src={contactPhoto}
                  alt={contactName}
                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover border-2 border-white/40"
                />
              ) : null}

              {/* Nombre + tagline */}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white whitespace-nowrap">
                  Hola, soy {contactName}
                </span>
                {tagline && (
                  <>
                    <span className="text-white/60 hidden sm:inline">·</span>
                    <span className="text-sm text-white/80 truncate hidden sm:block">{tagline}</span>
                  </>
                )}
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={handleBarClick}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-[0.97] border border-white/30"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
              >
                <Icon name="MessageCircle" size={14} color="#ffffff" />
                <span className="hidden sm:inline">Escribime</span>
                <span className="sm:hidden">Chat</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Sección hero ── */}
        <div
          className="w-full"
          style={{ borderBottom: `1px solid ${theme?.borderColor ?? '#e5e7eb'}` }}
        >
          <div className="max-w-5xl mx-auto md:grid md:grid-cols-2 md:gap-0 md:min-h-[280px]">

            {/* Imagen de portada / gradiente */}
            <div
              className="relative w-full overflow-hidden"
              style={{ minHeight: isDesktop ? '280px' : '200px' }}
            >
              {coverUrl ? (
                <img
                  src={cfImageUrl(coverUrl, isDesktop ? 'coverDesktop' : 'coverMobile')}
                  alt=""
                  role="presentation"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: `50% ${coverPositionY}%` }}
                  loading="eager"
                  fetchPriority="high"
                />
              ) : (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                  style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)` }}
                >
                  {logoUrl ? (
                    <CatalogImage
                      src={cfImageUrl(logoUrl, 'thumbnail')}
                      originalSrc={logoUrl}
                      alt={business?.name}
                      className="w-20 h-20 rounded-full border-4 border-white/30"
                      imgClassName="w-full h-full rounded-full object-cover"
                      variant="logo"
                      loading="eager"
                      fetchPriority="high"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center border-4 border-white/30 bg-white/20">
                      <Icon name={isRestaurant ? 'UtensilsCrossed' : 'Store'} size={36} color="#ffffff" />
                    </div>
                  )}
                  <span className="text-xl font-bold text-white text-center px-4">{business?.name}</span>
                </div>
              )}
              {/* Overlay gradiente derecha en desktop para transición suave */}
              {isDesktop && (
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-16"
                  style={{ background: `linear-gradient(to left, ${bgColor}, transparent)` }}
                />
              )}
            </div>

            {/* Panel de info */}
            <div
              className="flex flex-col justify-center gap-4 px-5 py-6 md:px-8 md:py-8"
              style={{ background: bgColor }}
            >
              {/* Logo + nombre */}
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <CatalogImage
                    src={cfImageUrl(logoUrl, 'thumbnail')}
                    originalSrc={logoUrl}
                    alt={business?.name}
                    className="w-12 h-12 rounded-full flex-shrink-0 border-2"
                    imgClassName="w-full h-full rounded-full object-cover"
                    variant="logo"
                    loading="eager"
                    fetchPriority="high"
                    style={{ borderColor: theme?.borderColor ?? '#e5e7eb' }}
                  />
                )}
                <div className="min-w-0">
                  <h1 className="text-xl font-black tracking-tight leading-tight" style={{ color: textColor }}>
                    {business?.name}
                  </h1>
                  {cityLine && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Icon name="MapPin" size={12} color={theme?.isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF'} />
                      <span className="text-xs" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.45)' : '#9CA3AF' }}>{cityLine}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Descripción */}
              {business?.description?.trim() && (
                <p className="text-sm leading-relaxed" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.72)' : '#4B5563' }}>
                  {business.description.trim()}
                </p>
              )}

              {/* Chips de envío */}
              {(hasDelivery || hasPickup || shippingCost) && (
                <div className="flex flex-wrap gap-2">
                  {hasPickup && (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: primaryRgba(0.12), color: primaryColorDark }}>
                      <Icon name="Store" size={12} color={primaryColorDark} />
                      Retiro disponible
                    </span>
                  )}
                  {hasDelivery && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
                      <Icon name="Bike" size={12} color="#C2410C" />
                      Delivery
                    </span>
                  )}
                  {shippingCost && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      <Icon name="Package" size={12} color="#475569" />
                      Envío: {shippingCost}
                    </span>
                  )}
                </div>
              )}

              {/* CTA principal */}
              {storeWhatsAppUrl && (
                <button
                  type="button"
                  onClick={handleBarClick}
                  className="self-start inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                >
                  <Icon name="MessageCircle" size={16} color="#ffffff" />
                  {isRestaurant ? 'Pedir por WhatsApp' : 'Escribinos por WhatsApp'}
                </button>
              )}
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
