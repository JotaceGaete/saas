import React from 'react';
import Icon from 'components/AppIcon';

const LOGO_SRC = '/logo-ventalink.png';
const DEMO_IMAGE_SRC = '/demo-dashboard.png';

export default function LoginLeftPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14"
      style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 60%, #4C1D95 100%)' }}
    >
      <div>
        {/* Logo como marca */}
        <div className="flex items-center gap-3 mb-12">
          <div className="h-9 flex items-center">
            <img
              src={LOGO_SRC}
              alt="VentALink"
              className="h-9 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                const fb = e.target.parentElement?.querySelector('.logo-fallback');
                if (fb) { fb.classList.remove('hidden'); fb.style.display = 'flex'; }
              }}
            />
            <div className="logo-fallback hidden w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center" aria-hidden>
              <Icon name="MessageCircle" size={20} color="#fff" />
            </div>
          </div>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-heading)' }}>VentALink</span>
        </div>

        {/* Headline */}
        <h2
          className="text-3xl xl:text-4xl font-bold text-white mb-4"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
        >
          Bienvenido de vuelta
        </h2>
        <p className="text-white/70 text-base mb-6" style={{ fontFamily: 'var(--font-body)' }}>
          Accede a tu panel para gestionar tu catálogo y recibir pedidos por WhatsApp.
        </p>

        {/* Imagen de demostración del panel (reemplaza la reseña) */}
        <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-xl min-h-[280px] max-h-[360px] bg-white/5">
          <img
            src={DEMO_IMAGE_SRC}
            alt="Vista del panel VentALink: dashboard, productos, pedidos"
            className="w-full h-full min-h-[280px] max-h-[360px] object-cover object-top"
            onError={(e) => {
              e.target.style.display = 'none';
              const fallback = e.target.parentElement?.querySelector('.demo-fallback');
              if (fallback) { fallback.classList.remove('hidden'); fallback.style.display = 'flex'; }
            }}
          />
          <div className="demo-fallback hidden absolute inset-0 flex items-center justify-center p-6" style={{ display: 'none' }}>
            <p className="text-white/80 text-sm text-center" style={{ fontFamily: 'var(--font-body)' }}>
              Dashboard • Productos • Pedidos • Configuración
            </p>
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
