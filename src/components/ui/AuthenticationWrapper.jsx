import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

const TRUST_ITEMS = [
  { icon: 'Store', text: '+2.400 negocios activos' },
  { icon: 'ShoppingCart', text: '+18.000 pedidos enviados' },
  { icon: 'Star', text: '4.9/5 valoración promedio' },
];

const TESTIMONIAL = {
  quote: '"Mis ventas subieron un 40% desde que uso CatálogoApp. Mis clientes pueden ver todo desde su celular."',
  name: 'Mariana López',
  role: 'Dulces Mariana · Repostería',
};

export default function AuthenticationWrapper({ children, title, subtitle, showBackToHome = true, footerText = null, footerLinkText = null, footerLinkPath = null }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Left panel - violet gradient with brand messaging */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #5B21B6 0%, #7C3AED 40%, #6D28D9 100%)' }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5" style={{ backgroundColor: '#fff' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <button
            onClick={() => navigate('/landing-page')}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
            aria-label="Ir al inicio"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Icon name="ShoppingBag" size={18} color="#FFFFFF" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>CatálogoApp</span>
          </button>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-300 pulse-dot" />
              <span className="text-xs font-medium text-white/90" style={{ fontFamily: 'var(--font-caption)' }}>Gratis para empezar</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em' }}>
              Vende más con tu catálogo online
            </h2>
            <p className="text-white/75 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
              Crea tu catálogo de productos y recibe pedidos directamente en WhatsApp. Sin comisiones, sin complicaciones.
            </p>
          </div>

          {/* Trust stats */}
          <div className="space-y-3 mb-8">
            {TRUST_ITEMS?.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <Icon name={item?.icon} size={15} color="#FFFFFF" />
                </div>
                <span className="text-sm text-white/85 font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{item?.text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="p-5 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
            <p className="text-sm text-white/90 leading-relaxed mb-3 italic" style={{ fontFamily: 'var(--font-body)' }}>
              {TESTIMONIAL?.quote}
            </p>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary" style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}>
                M
              </div>
              <div>
                <p className="text-xs font-semibold text-white" style={{ fontFamily: 'var(--font-caption)' }}>{TESTIMONIAL?.name}</p>
                <p className="text-xs text-white/65" style={{ fontFamily: 'var(--font-caption)' }}>{TESTIMONIAL?.role}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-xs text-white/50" style={{ fontFamily: 'var(--font-caption)' }}>
            © {new Date()?.getFullYear()} CatálogoApp
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-5 py-4 border-b" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)' }}>
          <button
            onClick={() => navigate('/landing-page')}
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            aria-label="Volver al inicio"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}>
              <Icon name="ShoppingBag" size={15} color="#FFFFFF" />
            </div>
            <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>CatálogoApp</span>
          </button>
          {showBackToHome && (
            <button
              onClick={() => navigate('/landing-page')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
              style={{ fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="ArrowLeft" size={14} color="currentColor" />
              Inicio
            </button>
          )}
        </header>

        {/* Desktop back link */}
        {showBackToHome && (
          <div className="hidden lg:flex px-10 pt-8">
            <button
              onClick={() => navigate('/landing-page')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              style={{ fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="ArrowLeft" size={14} color="currentColor" />
              Volver al inicio
            </button>
          </div>
        )}

        {/* Form area */}
        <main className="flex-1 flex items-center justify-center px-5 py-8 lg:px-10" role="main">
          <div className="w-full max-w-md">
            {/* Form card */}
            <div
              className="rounded-2xl border p-7 sm:p-8"
              style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-md)' }}
            >
              {(title || subtitle) && (
                <div className="mb-7">
                  {title && (
                    <h1 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.025em' }}>
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
              {children}
            </div>

            {footerText && footerLinkText && (
              <p className="text-center text-sm mt-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                {footerText}{' '}
                {footerLinkPath ? (
                  <button
                    onClick={() => navigate(footerLinkPath)}
                    className="font-semibold hover:underline focus-visible:outline-none"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {footerLinkText}
                  </button>
                ) : (
                  <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{footerLinkText}</span>
                )}
              </p>
            )}

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-5 mt-5">
              {[{ icon: 'Shield', text: 'Seguro' }, { icon: 'Lock', text: 'Privado' }, { icon: 'Zap', text: 'Gratis' }]?.map((item) => (
                <div key={item?.text} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  <Icon name={item?.icon} size={12} color="var(--color-primary)" />
                  <span>{item?.text}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}