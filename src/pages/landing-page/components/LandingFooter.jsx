import React from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";

export default function LandingFooter() {
  const navigate = useNavigate();

  return (
    <footer
      className="border-t py-10"
      style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}
      role="contentinfo"
    >
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
              >
                <Icon name="ShoppingBag" size={13} color="#FFFFFF" />
              </div>
              <span
                className="font-bold text-sm tracking-tight"
                style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
              >
                CatálogoApp
              </span>
            </div>
            <p className="text-xs max-w-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Catálogos online y pedidos por WhatsApp para negocios latinoamericanos.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: 'Dashboard', path: '/dashboard' },
              { label: 'Productos', path: '/product-management' },
              { label: 'Configuración', path: '/business-configuration' },
              { label: 'Crear cuenta', path: '/business-registration' },
            ]?.map((link) => (
              <button
                key={link?.path}
                onClick={() => navigate(link?.path)}
                className="text-xs transition-all duration-150 hover:text-foreground"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {link?.label}
              </button>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            © {new Date()?.getFullYear()} CatálogoApp
          </p>
        </div>
      </div>
    </footer>
  );
}