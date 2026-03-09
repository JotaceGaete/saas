import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

const QUICK_ACTIONS = [
  { label: "Agregar producto", desc: "Nuevo al catálogo", icon: "Plus", path: "/product-editor", primary: true },
  { label: "Ver catálogo", desc: "Vista pública", icon: "ExternalLink", path: "/public-catalog", primary: false },
  { label: "Compartir link", desc: "Copiar y compartir", icon: "Share2", path: null, primary: false },
];

export default function ActionButtons({ catalogUrl, onShare, onCopy }) {
  const navigate = useNavigate();

  const handleAction = (action) => {
    if (action?.path) {
      navigate(action?.path);
    } else {
      onShare?.();
    }
  };

  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-base font-bold"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.015em' }}
        >
          Acciones rápidas
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {QUICK_ACTIONS?.map((action, i) => (
          <button
            key={i}
            onClick={() => handleAction(action)}
            className="flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm text-left group"
            style={{
              backgroundColor: action?.primary ? 'rgba(124,58,237,0.04)' : '#FFFFFF',
              borderColor: action?.primary ? 'rgba(124,58,237,0.2)' : 'var(--color-border)',
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 group-hover:scale-105"
              style={{
                backgroundColor: action?.primary ? 'var(--color-primary)' : 'rgba(124,58,237,0.08)',
              }}
            >
              <Icon
                name={action?.icon}
                size={16}
                color={action?.primary ? '#FFFFFF' : 'var(--color-primary)'}
              />
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {action?.label}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {action?.desc}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Catalog URL bar */}
      <div
        className="mt-4 flex items-center gap-2.5 p-3 rounded-lg border"
        style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
      >
        <Icon name="Link" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
        <span
          className="flex-1 text-xs truncate"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-data)' }}
        >
          {catalogUrl}
        </span>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 text-xs font-semibold hover:underline focus-visible:outline-none px-1 flex-shrink-0 transition-colors"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          aria-label="Copiar enlace del catálogo"
        >
          <Icon name="Copy" size={12} color="var(--color-primary)" />
          Copiar
        </button>
      </div>
    </div>
  );
}