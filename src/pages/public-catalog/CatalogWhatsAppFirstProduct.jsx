/**
 * CatalogWhatsAppFirstProduct — fila de producto para el template "whatsapp_first".
 *
 * Cada producto se renderiza como una fila horizontal con foto cuadrada a la izquierda
 * y los detalles a la derecha, con un botón CTA que abre WhatsApp para consultar.
 *
 * Props:
 *   product         — objeto de producto
 *   business        — objeto de negocio
 *   slug            — slug del negocio
 *   formatPrice     — función de formateo de precio
 *   onWhatsAppClick — callback(source) llamado al hacer clic en el CTA de WhatsApp
 *   onAddToCart     — callback(product) para agregar al carrito (sigue funcionando)
 *   onOpenProduct   — callback(product) para abrir el modal de detalle
 *   primaryColor    — color primario
 *   primaryColorDark — color primario oscurecido
 *   theme           — resultado de resolveCatalogTheme()
 */
import React from 'react';
import Icon from '../../components/AppIcon';
import CatalogImage from '../../components/CatalogImage';
import { cfImageUrl } from '../../utils/cloudflareImage';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import { getProductCardImage } from './index';

export default function CatalogWhatsAppFirstProduct({
  product,
  business,
  slug,
  formatPrice,
  onWhatsAppClick,
  onAddToCart,
  onOpenProduct,
  primaryColor,
  primaryColorDark,
  theme,
  buildSingleWhatsAppUrl,
}) {
  if (!product) return null;

  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.1)');
  const textColor = theme?.textColor || '#111111';
  const cardBg = theme?.cardBg || '#ffffff';
  const borderColor = theme?.borderColor || '#e5e7eb';
  const isDark = theme?.isDark || false;

  const cardImage = getProductCardImage(product);
  const hasImage = !!cardImage;
  const isCombo = product?.isCombo === true || product?.type === 'combo';
  const isFeatured = product?.isMainFeatured === true || product?.is_main_featured === true;
  const hasOnSale = product?.onSale === true;
  const isSoldOut = product?.isSoldOut === true;

  const descriptionText = String(product?.description || '').trim();

  const handleWhatsAppCta = () => {
    const url = buildSingleWhatsAppUrl(product);
    if (url) {
      onWhatsAppClick?.('whatsapp_first_product');
      openWhatsAppUrl(url);
    }
  };

  const highlightBg = isCombo || isFeatured
    ? (isDark ? `rgba(${primaryColor.replace(/^#/, '').match(/../g).map(h => parseInt(h, 16)).join(',')},0.15)` : primaryRgba(0.06))
    : cardBg;

  return (
    <article
      className="rounded-2xl overflow-hidden border transition-shadow"
      style={{
        background: highlightBg,
        borderColor: isCombo || isFeatured ? `${primaryColor}33` : borderColor,
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex gap-0">
        {/* Foto cuadrada */}
        <div
          className="flex-shrink-0 relative overflow-hidden cursor-pointer"
          style={{ width: 120, minHeight: 120 }}
          role="button"
          tabIndex={0}
          aria-label={`Ver ${product?.name}`}
          onClick={() => onOpenProduct?.(product)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenProduct?.(product);
            }
          }}
        >
          {hasImage ? (
            <CatalogImage
              src={cfImageUrl(cardImage, 'cardMobile')}
              originalSrc={cardImage}
              alt={product?.name || 'Producto'}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover"
              style={{ width: 120, height: 120, minHeight: 120 }}
              variant="product"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6', minHeight: 120 }}
            >
              <Icon name="Package" size={32} color={isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'} />
            </div>
          )}
          {/* Badge agotado */}
          {isSoldOut && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <span className="text-white text-xs font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>Agotado</span>
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 p-3 sm:p-4">
          {/* Nombre + badges */}
          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={() => onOpenProduct?.(product)}
              className="text-left hover:underline decoration-2 underline-offset-2 focus-visible:outline-none"
            >
              <h3 className="text-base font-bold leading-snug tracking-tight" style={{ color: textColor }}>
                {product?.name}
              </h3>
            </button>
            {(isCombo || isFeatured) && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide flex-shrink-0"
                style={{ background: primaryRgba(0.14), color: primaryColorDark }}
              >
                {isCombo ? '🎁 Combo' : '⭐ Destacado'}
              </span>
            )}
            {hasOnSale && !isSoldOut && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black bg-red-100 text-red-600 flex-shrink-0">
                Oferta
              </span>
            )}
          </div>

          {/* Separador */}
          <div className="h-px w-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f4' }} />

          {/* Descripción completa */}
          {descriptionText && (
            <p className="text-sm leading-relaxed" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#4B5563' }}>
              {descriptionText}
            </p>
          )}

          {/* Precio */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isSoldOut ? (
              <span className="text-lg font-black tabular-nums" style={{ color: primaryColorDark }}>
                {formatPrice(product?.price)}
              </span>
            ) : (
              <span className="text-sm font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                Sin stock
              </span>
            )}
            {hasOnSale && product?.originalPrice > product?.price && (
              <span className="text-sm line-through tabular-nums" style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF' }}>
                {formatPrice(product?.originalPrice)}
              </span>
            )}
            {product?.category?.trim() && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                  color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280',
                  border: `1px solid ${borderColor}`,
                }}
              >
                {product.category}
              </span>
            )}
          </div>

          {/* CTA WhatsApp */}
          {!isSoldOut && (
            <button
              type="button"
              onClick={handleWhatsAppCta}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] mt-1"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Consultar sobre {product?.name}
            </button>
          )}

          {/* Agregar al carrito (secundario, siempre presente para usuarios que prefieren el carrito) */}
          {!isSoldOut && onAddToCart && (
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]"
              style={{
                background: 'transparent',
                color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280',
                border: `1px solid ${borderColor}`,
              }}
            >
              <Icon name="ShoppingCart" size={13} color="currentColor" />
              Agregar al carrito
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
