import React from 'react';
import Icon from 'components/AppIcon';

export default function LoginLeftPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14"
      style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 60%, #4C1D95 100%)' }}
    >
      <div>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon name="MessageCircle" size={20} color="#fff" />
          </div>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-heading)' }}>CatálogoWA</span>
        </div>

        {/* Headline */}
        <h2
          className="text-3xl xl:text-4xl font-bold text-white mb-4"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
        >
          Bienvenido de vuelta
        </h2>
        <p className="text-white/70 text-base mb-10" style={{ fontFamily: 'var(--font-body)' }}>
          Accede a tu panel para gestionar tu catálogo y recibir pedidos por WhatsApp.
        </p>

        {/* Testimonial quote */}
        <div className="bg-white/10 rounded-2xl p-5">
          <p className="text-white/90 text-sm leading-relaxed mb-3" style={{ fontFamily: 'var(--font-body)' }}>
            "Desde que uso CatálogoWA mis ventas aumentaron un 40%. Mis clientes pueden ver el catálogo y hacer pedidos sin llamarme."
          </p>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Icon name="User" size={14} color="rgba(255,255,255,0.9)" />
            </div>
            <div>
              <p className="text-white text-xs font-semibold" style={{ fontFamily: 'var(--font-caption)' }}>María González</p>
              <p className="text-white/60 text-xs" style={{ fontFamily: 'var(--font-caption)' }}>Tienda Artesanal, Santiago</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trust indicators */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: 'Package', label: 'Gestión de productos' },
          { icon: 'ShoppingCart', label: 'Pedidos por WhatsApp' },
          { icon: 'Link', label: 'Catálogo público' },
          { icon: 'BarChart2', label: 'Estadísticas' },
        ]?.map(f => (
          <div key={f?.label} className="flex items-center gap-2.5 bg-white/10 rounded-xl p-3">
            <Icon name={f?.icon} size={16} color="rgba(255,255,255,0.9)" />
            <span className="text-white/90 text-xs font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{f?.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
