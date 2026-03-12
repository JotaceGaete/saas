import React, { useState, useEffect } from 'react';

/**
 * Botón "Instalar app" que solo se muestra cuando el navegador
 * dispara beforeinstallprompt (Chrome/Edge en Android, etc.).
 * No se renderiza si el evento no existe (ya instalada, iOS, etc.).
 */
export default function PWAInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setVisible(false);
      setInstallPrompt(null);
    } catch (_) {
      setInstallPrompt(null);
    }
  };

  if (!visible || !installPrompt) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
      style={{
        backgroundColor: 'var(--color-primary, #7C3AED)',
        fontFamily: 'var(--font-caption, inherit)',
      }}
    >
      Instalar app
    </button>
  );
}
