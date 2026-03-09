import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';

export default function PublicHeader({
  businessName = 'Mi Negocio',
  businessLogo = null,
  showBackButton = false,
  backPath = '/landing-page',
  cartCount = 0,
  onCartClick,
}) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBack = () => {
    navigate(backPath);
  };

  const handleLogoClick = () => {
    navigate('/landing-page');
  };

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-navigation bg-card border-b border-border',
        'transition-all duration-250',
        scrolled ? 'shadow-sm' : '',
      ]?.join(' ')}
      style={{ transition: 'all var(--transition-base)' }}
      role="banner"
    >
      <div className="flex items-center h-14 px-4 gap-3 max-w-screen-xl mx-auto">
        {/* Back button */}
        {showBackButton && (
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
            aria-label="Volver"
            style={{ transition: 'all var(--transition-base)' }}
          >
            <Icon name="ArrowLeft" size={18} color="currentColor" />
          </button>
        )}

        {/* Logo + Business Name */}
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2.5 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1 -ml-1 hover:opacity-80 transition-all duration-250"
          aria-label={`Ir al inicio de ${businessName}`}
          style={{ transition: 'all var(--transition-base)' }}
        >
          {businessLogo ? (
            <Image
              src={businessLogo}
              alt={`Logo de ${businessName}`}
              className="w-8 h-8 rounded-md object-cover flex-shrink-0"
              width={32}
              height={32}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(196,112,74,0.15)' }}
            >
              <Icon name="ShoppingBag" size={16} color="var(--color-primary)" />
            </div>
          )}
          <span
            className="font-heading font-semibold text-foreground text-base truncate"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {businessName}
          </span>
        </button>

        {/* Cart button */}
        {onCartClick !== undefined && (
          <button
            onClick={onCartClick}
            className="relative flex items-center justify-center w-10 h-10 rounded-md text-foreground hover:bg-muted transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
            aria-label={`Carrito de compras${cartCount > 0 ? `, ${cartCount} artículos` : ''}`}
            style={{ transition: 'all var(--transition-base)' }}
          >
            <Icon name="ShoppingCart" size={20} color="currentColor" />
            {cartCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-5 h-5 flex items-center justify-center rounded-full text-xs font-medium text-primary-foreground"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  fontFamily: 'var(--font-caption)',
                  fontSize: '0.7rem',
                }}
                aria-hidden="true"
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        )}

        {/* WhatsApp CTA */}
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-secondary-foreground transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: 'var(--color-secondary)',
            fontFamily: 'var(--font-caption)',
            transition: 'all var(--transition-base)',
          }}
          aria-label="Contactar por WhatsApp"
        >
          <Icon name="MessageCircle" size={15} color="#FFFFFF" />
          <span>WhatsApp</span>
        </a>
      </div>
    </header>
  );
}