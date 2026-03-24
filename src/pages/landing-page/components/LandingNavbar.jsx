import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

export default function LandingNavbar({ onOpenRegister }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el?.scrollIntoView({ behavior: "smooth" });
  };

  const NAV_LINKS = [
    { label: 'Cómo funciona', id: 'como-funciona' },
    { label: 'Beneficios', id: 'beneficios' },
    { label: 'Testimonios', id: 'testimonios' },
  ];

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-navigation transition-all duration-300 w-full max-w-full overflow-x-hidden"
        style={{
          backgroundColor: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0)',
          borderBottom: scrolled ? '1px solid var(--color-border)' : '1px solid transparent',
          backdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
          boxShadow: scrolled ? 'var(--shadow-xs)' : 'none',
        }}
        role="navigation"
        aria-label="Navegación principal"
      >
        <div className="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 min-w-0">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg flex-shrink-0"
            aria-label="Ir al inicio"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)' }}
            >
              <Icon name="ShoppingBag" size={15} color="#FFFFFF" />
            </div>
            <span
              className="font-bold text-sm tracking-tight"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
            >
              VentALink
            </span>
          </button>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS?.map((link) => (
              <button
                key={link?.id}
                onClick={() => scrollTo(link?.id)}
                className="text-sm font-medium px-3.5 py-2 rounded-lg transition-all duration-150 hover:bg-muted hover:text-foreground"
                style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}
              >
                {link?.label}
              </button>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-all duration-150 hover:bg-muted"
              style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Iniciar sesión
            </button>
            <Button
              variant="default"
              size="sm"
              onClick={() => (onOpenRegister ? onOpenRegister() : navigate("/business-registration"))}
              className="shadow-violet"
            >
              Comenzar gratis
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            style={{ color: 'var(--color-foreground)' }}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
          >
            <Icon name={mobileMenuOpen ? "X" : "Menu"} size={18} color="currentColor" />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[99] overlay-enter"
          style={{ backgroundColor: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed top-0 right-0 h-full w-72 z-[100] border-l"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xl)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}>
                <Icon name="ShoppingBag" size={13} color="#FFFFFF" />
              </div>
              <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>VentALink</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Cerrar menú"
            >
              <Icon name="X" size={16} color="var(--color-foreground)" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS?.map((link) => (
              <button
                key={link?.id}
                onClick={() => scrollTo(link?.id)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
                style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {link?.label}
              </button>
            ))}
          </div>

          <div className="px-4 pt-2 border-t space-y-2.5" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => { setMobileMenuOpen(false); navigate("/login"); }}
              className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
              style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Iniciar sesión
            </button>
            <Button
              variant="default"
              size="lg"
              fullWidth
              onClick={() => {
                setMobileMenuOpen(false);
                if (onOpenRegister) onOpenRegister();
                else navigate("/business-registration");
              }}
            >
              Comenzar gratis
            </Button>
          </div>
        </div>
      )}
    </>
  );
}