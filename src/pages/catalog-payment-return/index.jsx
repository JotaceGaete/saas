import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import { getBusinessBySlug } from '../../services/waBusinessService';
import { getPublicCatalogRelativePath, getWhatsAppOrderCatalogUrl } from '../../config/appUrl';

/**
 * CatalogPaymentReturn — MP-CHECKOUT-3.
 * Vistas de retorno tras el checkout Mercado Pago del comercio
 * (/catalogo/:slug/pago/:status, alias /catalog/:slug/pago/:status).
 * `:status` es exactamente uno de los 3 valores que
 * create-merchant-mp-checkout ya usa en back_urls (MP-CHECKOUT-1):
 * exito | pendiente | error.
 *
 * IMPORTANTE — estas vistas son SOLO UX, nunca fuente de verdad:
 * - NO actualizan wa_orders.
 * - NO llaman ninguna RPC de pago.
 * - NO descuentan stock.
 * No leen ni confían en ningún query param que Mercado Pago pueda
 * agregar al redirect (payment_id, status, etc.) -- ni siquiera se
 * leen. La única confirmación real del pago ocurre server-side en
 * merchant-mp-webhook (MP-CHECKOUT-2), de forma completamente
 * independiente de que el comprador llegue o no a esta página (puede
 * cerrar la pestaña antes de volver y el pago se confirma igual).
 */

const STATUS_CONFIG = {
  exito: {
    icon: 'CheckCircle2',
    color: '#16a34a',
    bg: '#f0fdf4',
    title: 'Recibimos la confirmación de Mercado Pago',
    message: 'Tu pago fue enviado a Mercado Pago. El comercio confirmará tu pedido apenas se valide el pago -- puede tardar unos minutos.',
  },
  pendiente: {
    icon: 'Clock',
    color: '#d97706',
    bg: '#fffbeb',
    title: 'Tu pago está siendo procesado',
    message: 'Mercado Pago todavía está confirmando este pago. Te avisaremos apenas se apruebe -- no es necesario que hagas nada más.',
  },
  error: {
    icon: 'XCircle',
    color: '#dc2626',
    bg: '#fef2f2',
    title: 'No pudimos completar el pago',
    message: 'El pago no se realizó. Puedes intentar nuevamente desde el catálogo o contactar al comercio directamente.',
  },
};

export default function CatalogPaymentReturn() {
  const { slug, status } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.error;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      const { data } = await getBusinessBySlug(slug);
      if (!cancelled) setBusiness(data || null);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const whatsappNumber = business?.whatsapp?.replace(/\D/g, '');
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, hice un pedido en ${getWhatsAppOrderCatalogUrl(slug)} y quiero confirmar el estado de mi pago.`)}`
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-background, #f9fafb)' }}>
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: config.bg }}>
          <Icon name={config.icon} size={32} color={config.color} />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">{config.title}</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{config.message}</p>
        <div className="space-y-2">
          <button
            onClick={() => navigate(getPublicCatalogRelativePath(slug))}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Volver al catálogo
          </button>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <Icon name="MessageCircle" size={16} color="#25D366" />
              Contactar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
