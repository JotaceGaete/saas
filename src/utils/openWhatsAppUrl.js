/**
 * iPhone / iPod touch / iPad (incl. Safari “desktop” en iPad).
 * En iOS, operaciones async (p. ej. clipboard) antes de abrir wa.me rompen el gesto del usuario
 * y el navegador bloquea la navegación; por eso conviene `location.assign` en lugar de `window.open`.
 */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Abre una URL de WhatsApp (`wa.me/...`) desde un gesto directo del usuario (click/tap).
 * En iOS usa la misma pestaña; en el resto, nueva pestaña.
 * @returns {boolean} false si el navegador bloqueó la apertura (p. ej. popup); en iOS true si se inició la navegación.
 */
export function openWhatsAppUrl(url) {
  if (typeof window === 'undefined' || !url) return false;
  if (isIOSDevice()) {
    window.location.assign(url);
    return true;
  }
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  return !!popup;
}
