import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

export default function QuickAccessWidget({ catalogUrl }) {
  const navigate = useNavigate();

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
    { label: "Configuración", path: "/business-configuration", iconName: "Settings", desc: "Datos del negocio", color: 'var(--color-muted-foreground)', bg: 'rgba(107,114,128,0.08)' },
  ];

  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Acceso rápido</h2>
      <div className="space-y-1">
        {QUICK_LINKS?.map((link) => (
          <button
            key={link?.label}
            onClick={link?.action ?? (() => navigate(link?.path))}
            disabled={link?.action === null && !link?.path}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-all duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left group disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Ir a ${link?.label}`}
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
  );
}
