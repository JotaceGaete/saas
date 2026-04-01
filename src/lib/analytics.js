/**
 * Eventos de producto/analytics (GA4, dataLayer, PostHog si existen).
 * Sin dependencias: extensible cuando conectes un proveedor.
 */
export function trackEvent(eventName, payload = {}) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, payload);
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...payload });
    }
    if (typeof window.posthog?.capture === 'function') {
      window.posthog.capture(eventName, payload);
    }
  } catch {
    /* noop */
  }
  if (import.meta.env?.DEV) {
    console.info('[analytics]', eventName, payload);
  }
}
