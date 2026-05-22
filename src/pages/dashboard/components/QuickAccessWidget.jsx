import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import { appendBranding } from "../../../utils/branding";
import { openWhatsAppUrl } from "../../../utils/openWhatsAppUrl";

const STATUS_MESSAGE_TEMPLATE = `Nuevo catálogo disponible

Mira nuestros productos y haz tu pedido directo por WhatsApp:

{catalog_url}`;

export default function QuickAccessWidget({ catalogUrl, catalogViewUrl, businessPlanSlug, onCatalogShare }) {
  const navigate = useNavigate();
  const [showStatusModal, setShowStatusModal] = useState(false);

  const statusMessage = catalogUrl
    ? appendBranding(STATUS_MESSAGE_TEMPLATE.replace('{catalog_url}', catalogUrl), businessPlanSlug)
    : '';
  const viewUrl = catalogViewUrl || catalogUrl;

  const handleCopyStatusMessage = () => {
    if (!statusMessage) return;
    navigator.clipboard?.writeText(statusMessage)?.catch(() => {});
    setShowStatusModal(false);
    onCatalogShare?.();
  };

  const handleOpenWhatsAppStatus = () => {
    if (!statusMessage) return;
    openWhatsAppUrl(`https://wa.me/?text=${encodeURIComponent(statusMessage)}`);
    setShowStatusModal(false);
    onCatalogShare?.();
  };

  const QUICK_LINKS = [
    { label: "Producto", path: "/product-editor", iconName: "Plus", desc: "Nuevo item" },
    {
      label: "Compartir",
      action: viewUrl ? () => window.open(viewUrl, '_blank', 'noopener,noreferrer') : null,
      iconName: "ExternalLink",
      desc: "Abrir catálogo",
    },
    {
      label: "Estado",
      action: catalogUrl ? () => setShowStatusModal(true) : null,
      iconName: "MessageCircle",
      desc: "WhatsApp",
    },
    { label: "Pedidos", path: "/orders", iconName: "ShoppingBag", desc: "Gestionar" },
    { label: "Ajustes", path: "/business-configuration", iconName: "Settings", desc: "Tienda" },
  ];

  return (
    <>
      <div className="dashboard-command-bar rounded-2xl p-2">
        <div className="flex items-center justify-between gap-3 px-2 pb-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>Herramientas</h2>
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-5 lg:grid-cols-1">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={link.action ?? (() => navigate(link.path))}
              disabled={link.action === null && !link.path}
              className="group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all duration-150 hover:bg-white/80 hover:shadow-[0_6px_18px_rgba(17,24,39,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={link.label}
            >
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors group-hover:bg-slate-100" style={{ backgroundColor: 'transparent' }}>
                <Icon name={link.iconName} size={13} color="#374151" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{link.label}</p>
                <p className="truncate text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>{link.desc}</p>
              </div>
              <Icon name="ArrowUpRight" size={13} color="var(--color-muted-foreground)" className="hidden flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block" />
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
            className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-xl"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(37,211,102,0.12)' }}>
                <Icon name="MessageCircle" size={18} color="#25D366" />
              </div>
              <h2 id="status-modal-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Compartir en estado de WhatsApp
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Copia el mensaje o ábrelo en WhatsApp para publicarlo en tu estado.
              </p>
              <div
                className="whitespace-pre-wrap rounded-xl border p-3 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)', fontFamily: 'var(--font-body)', color: 'var(--color-foreground)' }}
              >
                {statusMessage || '-'}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCopyStatusMessage}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#111827', color: '#fff', fontFamily: 'var(--font-caption)' }}
                >
                  <Icon name="Copy" size={16} color="#fff" />
                  Copiar mensaje
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsAppStatus}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
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
                className="w-full rounded-lg py-2 text-sm font-medium transition-colors hover:bg-muted"
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
