import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { useConfirmedEmailGuard } from '../../../hooks/useConfirmedEmailGuard';

const STORAGE_KEY = 'tpv_sidebar_hidden';

function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  return [hidden, toggle];
}

export default function TerminalTPV() {
  useConfirmedEmailGuard?.();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [sidebarHidden, toggleSidebar] = useSidebarHidden();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = sidebarCollapsed
    ? 'var(--sidebar-collapsed-width)'
    : 'var(--sidebar-width)';

  const mainMargin = isDesktop && !sidebarHidden ? sidebarWidth : 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Sidebar — solo desktop, oculto cuando sidebarHidden */}
      {!sidebarHidden && (
        <BusinessSidebar
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      )}

      {/* Botón flotante para reabrir sidebar cuando está oculto */}
      {sidebarHidden && isDesktop && (
        <button
          onClick={toggleSidebar}
          className="fixed flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            top: 12,
            left: 12,
            zIndex: 'var(--z-navigation, 40)',
            fontFamily: 'var(--font-caption)',
            color: 'var(--color-foreground)',
            borderColor: 'var(--color-border)',
          }}
          title="Mostrar menú lateral"
          aria-label="Mostrar menú lateral"
        >
          <Icon name="PanelLeftOpen" size={15} color="currentColor" />
          <span>Menú</span>
        </button>
      )}

      {/* Contenido principal */}
      <main
        className="flex min-h-screen flex-col transition-all"
        style={{
          marginLeft: mainMargin,
          transition: 'margin-left var(--transition-base)',
        }}
      >
        {/* Header TPV */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
          style={{
            backgroundColor: 'var(--color-background)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* En mobile el hamburger viene del BusinessSidebar; en desktop mostramos botón de ocultar */}
            {isDesktop && !sidebarHidden && (
              <button
                onClick={toggleSidebar}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  fontFamily: 'var(--font-caption)',
                  color: 'var(--color-muted-foreground)',
                  borderColor: 'var(--color-border)',
                }}
                title="Ocultar menú lateral"
                aria-label="Ocultar menú lateral"
              >
                <Icon name="PanelLeftClose" size={15} color="currentColor" />
                <span>Ocultar menú</span>
              </button>
            )}
            <h1
              className="text-sm font-semibold"
              style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
            >
              Terminal de ventas
            </h1>
          </div>
        </header>

        {/* Cuerpo del TPV */}
        <div className="flex flex-1 overflow-hidden">
          {/* Panel de productos */}
          <section className="flex-1 overflow-y-auto p-4">
            <div
              className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
            >
              <Icon name="Search" size={16} color="var(--color-muted-foreground)" />
              <input
                type="search"
                placeholder="Buscar producto o escanear código…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}
              />
            </div>

            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <button
                  key={i}
                  className="flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'var(--color-muted)' }}
                  >
                    <Icon name="Package" size={22} color="var(--color-muted-foreground)" />
                  </div>
                  <span className="text-xs font-medium leading-tight" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                    Producto {i + 1}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    $0.00
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Panel de carrito */}
          <aside
            className="hidden md:flex w-72 lg:w-80 flex-col border-l"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                Carrito
              </span>
              <Icon name="ShoppingCart" size={16} color="var(--color-muted-foreground)" />
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div>
                <Icon name="ShoppingCart" size={36} color="var(--color-muted-foreground)" />
                <p className="mt-3 text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Agrega productos al carrito para comenzar una venta
                </p>
              </div>
            </div>
            <div className="border-t p-4 space-y-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between text-sm" style={{ fontFamily: 'var(--font-caption)' }}>
                <span style={{ color: 'var(--color-muted-foreground)' }}>Subtotal</span>
                <span style={{ color: 'var(--color-foreground)' }}>$0.00</span>
              </div>
              <button
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                disabled
              >
                Cobrar
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
