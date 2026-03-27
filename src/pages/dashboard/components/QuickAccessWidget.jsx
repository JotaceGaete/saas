import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import { appendBranding } from "../../../utils/branding";

const STATUS_MESSAGE_TEMPLATE = `Nuevo catálogo disponible 👇

Mira nuestros productos y haz tu pedido directo por WhatsApp:

{catalog_url}`;

export default function QuickAccessWidget({ catalogUrl, businessName, businessPlanSlug, onCatalogShare }) {
  const navigate = useNavigate();
  const [showStatusModal, setShowStatusModal] = useState(false);

  const statusMessage = catalogUrl
    ? appendBranding(STATUS_MESSAGE_TEMPLATE.replace('{catalog_url}', catalogUrl), businessPlanSlug)
    : '';

  const handleCopyStatusMessage = () => {
    if (!statusMessage) return;
    navigator.clipboard?.writeText(statusMessage)?.catch(() => {});
    setShowStatusModal(false);
    onCatalogShare?.();
  };

  const handleOpenWhatsAppStatus = () => {
    if (!statusMessage) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(statusMessage)}`, '_blank', 'noopener,noreferrer');
    setShowStatusModal(false);
    onCatalogShare?.();
  };

  const QUICK_LINKS = [
    { label: "Ver pedidos", path: "/orders", iconName: "ShoppingBag", desc: "Gestiona pedidos de clientes", color: '#D97706', bg: 'rgba(245,158,11,0.1)' },
    { label: "Agregar producto", path: "/product-editor", iconName: "PlusSquare", desc: "Agregar al catálogo", color: 'var(--color-primary)', bg: 'rgba(124,58,237,0.08)' },
    {
      label: "Ver catálogo",
      action: catalogUrl ? () => window.open(catalogUrl, '_blank', 'noopener,noreferrer') : null,
      iconName: "ExternalLink",
      desc: "Abre tu catálogo público",
      color: '#0EA5E9',
      bg: 'rgba(14,165,233,0.1)',
    },
    {
      label: "Compartir en estado de WhatsApp",
      action: catalogUrl ? () => setShowStatusModal(true) : null,
      iconName: "MessageCircle",
      desc: "Publicar tu catálogo en tu estado de WhatsApp",
      color: '#25D366',
      bg: 'rgba(37,211,102,0.12)',
    },
    { label: "Configuración", path: "/business-configuration", iconName: "Settings", desc: "Datos del negocio", color: 'var(--color-muted-foreground)', bg: 'rgba(107,114,128,0.08)' },
  ];

  return (
    <>
      <div className="dashboard-premium-card rounded-2xl border-0 p-5">
        <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Acceso rápido</h2>
        <div className="space-y-1">
          {QUICK_LINKS?.map((link) => (
            <button
              key={link?.label}
              onClick={link?.action ?? (() => navigate(link?.path))}
              disabled={link?.action === null && !link?.path}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={link?.label}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: link?.bg }}>
                <Icon name={link?.iconName} size={15} color={link?.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{link?.label}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>{link?.desc}</p>
              </div>
              <Icon name="ChevronRight" size={14} color="var(--color-muted-foreground)" className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </div>

      {showStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowStatusModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
        >
          <div
            className="rounded-2xl border bg-white shadow-xl w-full max-w-md overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(37,211,102,0.12)' }}>
                <Icon name="MessageCircle" size={18} color="#25D366" />
              </div>
              <h2 id="status-modal-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Compartir en estado de WhatsApp
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Copia el mensaje o ábrelo en WhatsApp para publicarlo en tu estado.
              </p>
              <div
                className="rounded-xl border p-3 text-sm whitespace-pre-wrap"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)', fontFamily: 'var(--font-body)', color: 'var(--color-foreground)' }}
              >
                {statusMessage || '—'}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCopyStatusMessage}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="Copy" size={16} color="#fff" />
                  Copiar mensaje
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsAppStatus}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="MessageCircle" size={16} color="#fff" />
                  Abrir WhatsApp
                </button>
              </div>
            </div>
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="w-full py-2 text-sm font-medium rounded-lg transition-colors hover:bg-muted"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
