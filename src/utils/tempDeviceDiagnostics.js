/**
 * TEMPORAL — diagnóstico de un crash que solo ocurre en un Android (funciona en
 * PC y otra tablet) al actuar sobre un pedido. Los logs de Supabase no muestran
 * ninguna escritura en el momento del fallo, por lo que la excepción es del lado
 * cliente (probablemente durante un re-render, no dentro del handler async).
 *
 * Adjunta contexto de dispositivo/navegador a los eventos de Sentry para poder
 * comparar el dispositivo que falla contra los que funcionan. Quitar esta
 * instrumentación una vez identificada la causa real.
 */
export function getTempDeviceDiagnosticContext() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;

  // Postgres/PostgREST devuelve timestamps con precisión de microsegundos
  // (6 dígitos de fracción), fuera del formato estricto de ECMA-262 (3 dígitos).
  // El parseo de ese formato es "implementation-defined": confirmar si el
  // Date() de este navegador lo acepta o devuelve Invalid Date.
  let microsecondTimestampParses = true;
  try {
    microsecondTimestampParses = !Number.isNaN(new Date('2020-01-01T00:00:00.123456+00:00').getTime());
  } catch (_e) {
    microsecondTimestampParses = false;
  }

  let isDesktopBreakpoint = null;
  try {
    isDesktopBreakpoint = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : null;
  } catch (_e) {
    isDesktopBreakpoint = null;
  }

  return {
    user_agent: navigator.userAgent || null,
    platform: navigator.platform || null,
    viewport_width: window.innerWidth ?? null,
    viewport_height: window.innerHeight ?? null,
    device_pixel_ratio: window.devicePixelRatio ?? null,
    is_desktop_breakpoint: isDesktopBreakpoint,
    max_touch_points: navigator.maxTouchPoints ?? null,
    microsecond_timestamp_parses: microsecondTimestampParses,
    sw_controlled: typeof navigator.serviceWorker !== 'undefined' ? Boolean(navigator.serviceWorker.controller) : null,
    release: (typeof window !== 'undefined' && window.SENTRY_RELEASE?.id) || null,
  };
}
