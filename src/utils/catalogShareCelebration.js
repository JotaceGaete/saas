import { celebrarPrimerEnvio } from './confettiCelebrations';

const storageKey = (businessId) => `vl_first_catalog_share_${businessId}`;

function dispatchCatalogSharedEvent(businessId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('ventalink-catalog-shared', { detail: { businessId } }),
  );
}

/** Paso 3 de onboarding: el usuario ya compartió el catálogo al menos una vez. */
export function hasCompletedCatalogShare(businessId) {
  if (!businessId || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(storageKey(businessId)) === '1';
}

/**
 * Primera acción de "compartir" el catálogo (localStorage por negocio).
 * Opcional: `catalogVisitsTotal` para refuerzo (p. ej. 0 visitas).
 * @returns {boolean} true si se lanzó confeti (el caller muestra el toast).
 */
export function tryCelebrateFirstCatalogShare(businessId, _catalogVisitsTotal = 0) {
  if (!businessId || typeof localStorage === 'undefined') return false;
  const key = storageKey(businessId);
  if (localStorage.getItem(key) === '1') return false;

  localStorage.setItem(key, '1');
  dispatchCatalogSharedEvent(businessId);
  celebrarPrimerEnvio();
  return true;
}
