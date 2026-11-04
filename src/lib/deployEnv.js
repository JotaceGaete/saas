// Entorno en el que corre Walinka: Preview (Vercel), local o producción.
//
// VITE_VERCEL_ENV lo fija vite.config.js con el entorno real de la compilación
// en Vercel. Manda sobre el hostname: una compilación de producción nunca es
// Preview (aunque se abra por un alias), y una de Preview lo es por cualquier URL.

// Alias de rama de Vercel (saas-git-<rama>-<equipo>.vercel.app), salvo el de
// main, que sirve lo mismo que producción.
export const PREVIEW_BRANCH_HOST = /^saas-git-(?!main-)[a-z0-9-]+\.vercel\.app$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/i;

/** Preview de Vercel o equipo local de desarrollo. Nunca producción. */
export function isPreviewLike(env = {}, hostname = '') {
  if (env.VITE_VERCEL_ENV === 'production') return false;
  return env.VITE_VERCEL_ENV === 'preview' || PREVIEW_BRANCH_HOST.test(String(hostname || '')) || LOCAL_HOST.test(String(hostname || ''));
}

/** Solo un despliegue Preview de Vercel (sin contar localhost). */
export function isPreviewDeployment(env = {}, hostname = '') {
  if (env.VITE_VERCEL_ENV === 'production') return false;
  return env.VITE_VERCEL_ENV === 'preview' || PREVIEW_BRANCH_HOST.test(String(hostname || ''));
}
