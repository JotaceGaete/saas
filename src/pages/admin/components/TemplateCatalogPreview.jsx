import React, { useMemo } from 'react';
import { CartProvider } from '../../../contexts/CartContext';
import CatalogStoreHeader from '../../public-catalog/CatalogStoreHeader';
import { ProductCard } from '../../public-catalog';
import { resolveCatalogTheme } from '../../../utils/catalogTheme';
import { formatPrice } from '../../../utils/formatPrice';

/**
 * Vista previa viva de una plantilla de catálogo, renderizada con los MISMOS
 * componentes del catálogo público (CatalogStoreHeader + ProductCard): lo que
 * el admin ve aquí es exactamente lo que recibirá un negocio nuevo.
 *
 * Funciona 100% con el estado del editor (sin guardar en DB): el mapper
 * templateToPreviewData convierte form/categorías/productos al shape que
 * esperan los componentes reales (business mapeado + wa_products camelCase).
 *
 * Notas de integración:
 *  - El contenedor del teléfono lleva transform (translateZ(0)) para que el
 *    header `position: fixed` del catálogo quede contenido en el marco.
 *  - onClickCapture bloquea navegación y tracking (links de WhatsApp, mapas)
 *    sin matar el scroll del preview.
 *  - ProductCard requiere CartProvider aunque se use readOnly.
 */

export function templateToPreviewData({ form, categories = [], products = [] }) {
  const categoryNames = categories.map((c) => String(c?.name || '').trim()).filter(Boolean);

  const business = {
    id: 'template-preview',
    name: String(form?.name || '').trim() || 'Tu Tienda',
    description: String(form?.description || '').trim(),
    logoUrl: form?.logoUrl || null,
    coverImageUrl: form?.bannerUrl || null,
    whatsapp: '+56 9 1234 5678',
    currency: 'CLP',
    countryCode: 'CL',
    designSettings: {
      primaryColor: form?.primaryColor || undefined,
      template: form?.theme || undefined,
      backgroundColor: form?.secondaryColor || undefined,
      useCategories: categoryNames.length > 0,
      // 'cover' es el único template del header cuyo markup (banner + tarjeta)
      // se comparte entre móvil y desktop. Los otros dependen de media queries
      // del viewport del navegador, que dentro del mockup de 300px mostrarían
      // la rama desktop aplastada y ocultarían el banner móvil.
      headerTemplate: 'cover',
      storeHeader: { showStoreName: true, showDescription: true, showWhatsAppButton: true },
      cardSettings: { showPrice: true, showDescription: true, showWhatsApp: true },
    },
  };

  const previewProducts = (products || [])
    .filter((p) => String(p?.name || '').trim())
    .map((p, index) => ({
      id: p?.id || p?._key || `preview-${index}`,
      name: p.name,
      description: p?.description || '',
      price: Number(p?.price) || 0,
      category: p?.categoryName || null,
      imageUrl: p?.imageUrl || null,
      images: p?.imageUrl ? [p.imageUrl] : [],
      cardImageUrl: p?.imageUrl || null,
      thumbnailUrl: p?.imageUrl || null,
      isActive: true,
      showPrice: true,
    }));

  // Plantilla con pocos productos: rellenar con placeholders (sin imagen,
  // CatalogImage muestra su fallback) para que el preview transmita cómo se
  // verá un catálogo poblado.
  for (let i = previewProducts.length; i < 4; i += 1) {
    previewProducts.push({
      id: `placeholder-${i}`,
      name: `Producto de ejemplo ${i + 1}`,
      description: 'Así se verá un producto de esta plantilla.',
      price: 9990,
      category: categoryNames[0] || null,
      imageUrl: null,
      images: [],
      cardImageUrl: null,
      thumbnailUrl: null,
      isActive: true,
      showPrice: true,
    });
  }

  return { business, products: previewProducts, categoryNames };
}

/** Contenido del catálogo (header real + categorías + grid real). */
export function TemplateCatalogPreview({ form, categories, products, isDesktop = false }) {
  const { business, products: previewProducts, categoryNames } = useMemo(
    () => templateToPreviewData({ form, categories, products }),
    [form, categories, products],
  );
  const design = business.designSettings;
  const theme = useMemo(() => resolveCatalogTheme(design), [design]);
  const fmtPrice = (amount) => formatPrice(amount, business.currency, business.countryCode);

  return (
    <CartProvider>
      <div
        className="min-h-full"
        style={{ background: theme.bgColor }}
        onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <CatalogStoreHeader
          business={business}
          theme={theme}
          slug={null}
          isDesktop={isDesktop}
          badgeLabel="Activa"
        />

        {categoryNames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 max-w-5xl mx-auto" style={{ scrollbarWidth: 'none' }}>
            {['Todos', ...categoryNames].map((name, index) => (
              <span
                key={name}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={index === 0
                  ? { background: theme.primaryColor, color: '#fff' }
                  : { background: theme.cardBg, color: theme.textColor, border: `1px solid ${theme.borderColor}` }}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        <div className={`max-w-5xl mx-auto px-4 pb-8 ${categoryNames.length > 0 ? '' : 'pt-4'}`}>
          {previewProducts.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: theme.isDark ? 'rgba(255,255,255,0.5)' : '#94A3B8' }}>
              Agrega productos a la plantilla para verlos aquí.
            </p>
          ) : (
            <div className={`grid gap-3 ${isDesktop ? 'grid-cols-3 lg:grid-cols-4 gap-4' : 'grid-cols-2'}`}>
              {previewProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  formatPrice={fmtPrice}
                  onOpen={() => {}}
                  theme={theme}
                  cardSettings={design.cardSettings}
                  useCategories={categoryNames.length > 0}
                  readOnly
                  isDesktop={isDesktop}
                  imageIndex={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </CartProvider>
  );
}

/**
 * Marco de teléfono de 300px que renderiza el contenido a ancho real móvil
 * (390px, como un iPhone estándar) y lo escala con transform: así los
 * paddings, el grid de 2 columnas y las tipografías del catálogo se ven en
 * su proporción real. El scroller interno (escalado) mantiene scroll real;
 * el transform además lo vuelve containing block de los position:fixed del
 * catálogo, conteniéndolos dentro del marco.
 *
 * resetKey: cambia (p. ej. templateId) → el scroll vuelve arriba.
 */
const PHONE_FRAME_WIDTH = 300;
const PHONE_FRAME_HEIGHT = 580;
const PHONE_CONTENT_WIDTH = 390;
const PHONE_SCALE = PHONE_FRAME_WIDTH / PHONE_CONTENT_WIDTH;

export function PhoneMockup({ children, resetKey }) {
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey]);

  return (
    <div className="mx-auto w-[300px]">
      <div className="rounded-[2.2rem] border-[7px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="relative bg-white overflow-hidden" style={{ height: PHONE_FRAME_HEIGHT }}>
          <div
            ref={scrollRef}
            className="overflow-y-auto overscroll-contain"
            style={{
              width: PHONE_CONTENT_WIDTH,
              height: PHONE_FRAME_HEIGHT / PHONE_SCALE,
              transform: `scale(${PHONE_SCALE})`,
              transformOrigin: 'top left',
              scrollbarWidth: 'none',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal fullscreen para "Abrir preview completo" (usa el estado vivo del editor). */
export function TemplateFullPreviewModal({ form, categories, products, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/60" role="dialog" aria-modal="true" aria-label="Vista previa completa de la plantilla">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 text-white flex-shrink-0">
        <p className="text-sm font-bold truncate">
          Vista previa — {String(form?.name || '').trim() || 'Plantilla sin nombre'}
        </p>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 transition-colors"
        >
          Cerrar (Esc)
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden bg-white" style={{ transform: 'translateZ(0)' }}>
        <div className="h-full overflow-y-auto">
          <TemplateCatalogPreview form={form} categories={categories} products={products} isDesktop />
        </div>
      </div>
    </div>
  );
}
