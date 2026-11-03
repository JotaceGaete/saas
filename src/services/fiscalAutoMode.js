// Modo del flujo automático de boleta en el TPV (venta cobrada -> DTE 39 -> impresión).
//
//   off        (por defecto) el TPV imprime el ticket de siempre, como en producción hoy.
//   simulated  emisión SIMULADA en el navegador: sin DTE Core, sin SII, sin folios reales.
//              Solo en Preview (alias de rama de Vercel, VITE_VERCEL_ENV=preview) o localhost;
//              en cualquier otro host se apaga. Es el modo por defecto en el alias de rama.
//   live       emisión real vía fiscal-emit (DTE Core). Solo con VITE_FISCAL_AUTO_EMIT=live,
//              que Juan pone a mano cuando autorice. Aun así el servidor exige emisor
//              verificado, control global encendido, credencial y venta elegible.
//
// VITE_FISCAL_AUTO_EMIT=off lo apaga siempre.

const PREVIEW_BRANCH_HOST = /^saas-git-(?!main-)[a-z0-9-]+\.vercel\.app$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i;

// VITE_VERCEL_ENV lo fija vite.config.js con el entorno real de la compilación
// en Vercel. Manda sobre el hostname: una compilación de producción nunca es
// Preview (aunque se abra por un alias), y una de Preview lo es por cualquier URL.
export function isPreviewLike(env = {}, hostname = '') {
  if (env.VITE_VERCEL_ENV === 'production') return false;
  return env.VITE_VERCEL_ENV === 'preview' || PREVIEW_BRANCH_HOST.test(String(hostname || '')) || LOCAL_HOST.test(String(hostname || ''));
}

function isPreviewDeployment(env = {}, hostname = '') {
  if (env.VITE_VERCEL_ENV === 'production') return false;
  return env.VITE_VERCEL_ENV === 'preview' || PREVIEW_BRANCH_HOST.test(String(hostname || ''));
}

export function resolveFiscalAutoMode(env = {}, hostname = '') {
  const raw = String(env.VITE_FISCAL_AUTO_EMIT || '').trim().toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'live') return 'live';
  if (raw === 'simulated') return isPreviewLike(env, hostname) ? 'simulated' : 'off';
  return isPreviewDeployment(env, hostname) ? 'simulated' : 'off';
}

export const FISCAL_AUTO_MODE = resolveFiscalAutoMode(
  import.meta.env || {},
  typeof window !== 'undefined' ? window.location?.hostname : '',
);
