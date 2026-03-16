import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { isPWA } from 'utils/isPWA';

function getPlatform() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

/**
 * Bloque "Instalar aplicación" para Configuración.
 * Muestra texto explicativo y botón que dispara beforeinstallprompt cuando está disponible.
 * No interrumpe la navegación; el usuario instala desde Configuración si lo desea.
 */
export default function InstallAppBlock() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(getPlatform());
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [mounted]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstallPrompt(null);
    } catch (_) {
      setInstallPrompt(null);
    }
  };

  if (!mounted) return null;

  const alreadyInstalled = isPWA();

  return (
    <div
      className="rounded-2xl border p-6"
      style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
          <Icon name="Smartphone" size={18} color="var(--color-primary)" />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Instalar aplicación</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Acceso rápido desde la pantalla de inicio
          </p>
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
        Puedes instalar la app en tu teléfono para abrir el panel sin pasar por el navegador y tener un acceso más rápido.
      </p>
      {alreadyInstalled ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Icon name="CheckCircle" size={18} color="#059669" />
          <span className="text-sm font-medium" style={{ color: '#059669', fontFamily: 'var(--font-caption)' }}>Ya tienes la aplicación instalada</span>
        </div>
      ) : platform === 'ios' ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
            En iPhone o iPad: abre el menú <strong>Compartir</strong> en Safari y elige <strong>Añadir a la pantalla de inicio</strong>.
          </p>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50" style={{ border: '1px solid var(--color-border)' }}>
            <Icon name="Share2" size={18} color="var(--color-text-secondary)" />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Compartir → Añadir a la pantalla de inicio</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {installPrompt ? (
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Download" size={18} color="#fff" />
              Instalar aplicación
            </button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
              El botón de instalación aparecerá aquí cuando tu navegador lo permita (por ejemplo en Chrome en Android). También puedes usar el menú del navegador para instalar la app.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
