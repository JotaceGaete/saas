import { celebrarPrimerEnvio } from './confettiCelebrations';

const storageKey = (businessId) => `vl_first_catalog_share_${businessId}`;

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
  celebrarPrimerEnvio();
  return true;
}
