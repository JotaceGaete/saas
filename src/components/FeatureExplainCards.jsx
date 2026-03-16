import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

/** Items usados en login/registro/dashboard con label, descripción y ruta */
export const FEATURE_ITEMS = [
  {
    icon: 'Package',
    label: 'Gestión de productos',
    description: 'Agrega y organiza tus productos: fotos, precios y descripciones. Activa o desactiva lo que quieras mostrar en el catálogo.',
    path: '/product-management',
    cta: 'Ir a Productos',
  },
  {
    icon: 'ShoppingCart',
    label: 'Pedidos por WhatsApp',
    description: 'Los pedidos que armen tus clientes en el catálogo llegan aquí. Puedes ver estado, totales y responder por WhatsApp.',
    path: '/orders',
    cta: 'Ver pedidos',
  },
  {
    icon: 'Link',
    label: 'Catálogo público',
    description: 'Un enlace que puedes compartir por WhatsApp, redes o QR. Tus clientes ven tus productos y arman el pedido desde ahí.',
    path: null,
    cta: null,
    openCatalog: true,
  },
  {
    icon: 'BarChart2',
    label: 'Estadísticas',
    description: 'Resumen de visitas al catálogo, pedidos del mes y productos más vendidos (según tu plan).',
    path: '/dashboard',
    cta: 'Ir al panel',
  },
];

/**
 * Tarjetas de funciones (Gestión de productos, Pedidos, etc.) que al hacer clic
 * muestran una explicación breve y opción de ir a la sección.
 */
export default function FeatureExplainCards({ variant = 'grid', catalogUrl, businessSlug }) {
  const navigate = useNavigate();
  const [modalItem, setModalItem] = useState(null);

  const handleCardClick = (item) => {
    setModalItem(item);
  };

  const handleGoTo = (item) => {
    if (item?.openCatalog && (catalogUrl || businessSlug)) {
      if (catalogUrl) window.open(catalogUrl, '_blank', 'noopener,noreferrer');
      else if (businessSlug) navigate(`/catalogo/${businessSlug}`);
    } else if (item?.path) {
      navigate(item.path);
    }
    setModalItem(null);
  };

  const isGrid = variant === 'grid';
  const isCompact = variant === 'compact';

  return (
    <>
      <div className={isGrid ? 'grid grid-cols-2 gap-3' : 'flex flex-wrap gap-2'}>
        {FEATURE_ITEMS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => handleCardClick(f)}
            className={`flex items-center gap-2.5 rounded-xl p-3 text-left transition-all hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
              isCompact ? 'bg-white/10' : 'bg-white/10 hover:bg-white/15'
            }`}
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Icon name={f.icon} size={isCompact ? 14 : 16} color="rgba(255,255,255,0.9)" />
            <span className="text-white/90 text-xs font-medium" style={{ fontFamily: 'var(--font-caption)' }}>
              {f.label}
            </span>
          </button>
        ))}
      </div>

      {modalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setModalItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feature-modal-title"
        >
          <div
            className="rounded-2xl border bg-white shadow-xl w-full max-w-sm overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
                <Icon name={modalItem.icon} size={20} color="var(--color-primary)" />
              </div>
              <h2 id="feature-modal-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                {modalItem.label}
              </h2>
            </div>
            <div className="p-4">
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)', lineHeight: 1.5 }}>
                {modalItem.description}
              </p>
              <div className="flex gap-2 flex-wrap">
                {(modalItem.path || (modalItem.openCatalog && (catalogUrl || businessSlug))) && (
                  <button
                    type="button"
                    onClick={() => handleGoTo(modalItem)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                  >
                    {modalItem.openCatalog ? 'Ver catálogo' : modalItem.cta}
                    <Icon name="ArrowRight" size={14} color="#fff" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalItem(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-muted"
                  style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
