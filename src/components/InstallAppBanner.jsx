import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { isPWA } from 'utils/isPWA';

const STORAGE_KEY = 'ventalink_install_banner_dismissed';

function getPlatform() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPWA()) return;
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (dismissed === '1') return;
    const p = getPlatform();
    if (p) {
      setPlatform(p);
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {}
  };

  if (!visible || !platform) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[98] lg:hidden flex items-center gap-3 px-4 py-3 border-t shadow-lg"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: 'var(--color-card)',
        borderColor: 'var(--color-border)',
        paddingBottom: '12px',
      }}
    >
      <div className="flex-1 min-w-0">
        {platform === 'ios' ? (
          <>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Instala VentALink en tu teléfono
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Toca Compartir → Añadir a la pantalla de inicio
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Instala la app para un acceso más rápido
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        aria-label="Cerrar"
      >
        <Icon name="X" size={16} color="var(--color-muted-foreground)" />
      </button>
    </div>
  );
}
