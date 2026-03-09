import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

const QUICK_LINKS = [
  { label: "Gestión de productos", path: "/product-management", iconName: "Package", desc: "Ver y editar tu catálogo" },
  { label: "Nuevo producto", path: "/product-editor", iconName: "PlusSquare", desc: "Agregar al catálogo" },
  { label: "Configuración", path: "/business-configuration", iconName: "Settings", desc: "Datos del negocio" },
];

export default function QuickAccessWidget() {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-base font-bold mb-4" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Acceso rápido</h2>
      <div className="space-y-1.5">
        {QUICK_LINKS?.map((link) => (
          <button
            key={link?.path}
            onClick={() => navigate(link?.path)}
            className="w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left group"
            aria-label={`Ir a ${link?.label}`}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
              <Icon name={link?.iconName} size={15} color="var(--color-primary)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: 'var(--font-caption)' }}>{link?.label}</p>
              <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>{link?.desc}</p>
            </div>
            <Icon name="ChevronRight" size={14} color="var(--color-muted-foreground)" className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  );
}