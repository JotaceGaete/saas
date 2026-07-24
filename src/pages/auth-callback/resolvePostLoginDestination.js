import { isOnboardingComplete } from '../../lib/country/business-country-policy';
import { getPublicCatalogUrl } from '../../config/appUrl';
import { isSafeReturnPath } from '../../lib/authReturnTo';

/**
 * Decide a dónde ir tras un login exitoso en Walinka (go.ventalink.app).
 * Pura: no navega ni toca window/router, solo devuelve la decisión, para que
 * las reglas de negocio (onboarding, slug, negocios duplicados) se puedan
 * testear sin mockear Supabase ni el DOM.
 *
 * Prioridad:
 * 1. returnTo explícito y seguro (ruta interna que originó el login) — pero
 *    nunca para un usuario sin negocio: primero debe pasar por el registro.
 * 2. Sin negocio → onboarding existente (/business-registration).
 * 3. Más de un negocio para el mismo usuario → /dashboard (no elegimos uno
 *    arbitrariamente; ahí el usuario ve/gestiona su negocio, y si algún día
 *    existe un selector, vive en esa ruta).
 * 4. Negocio con onboarding incompleto (país/nombre/whatsapp) → /onboarding.
 * 5. Negocio completo pero sin slug de catálogo → /business-configuration
 *    (ahí está el campo "Enlace del catálogo").
 * 6. Negocio completo con slug → su catálogo público (getPublicCatalogUrl),
 *    fuera del dominio de la app — el catálogo no requiere sesión.
 *
 * @returns {{ type: 'internal', path: string } | { type: 'external', url: string }}
 */
export function resolvePostLoginDestination({ business, hasMultipleBusinesses = false, returnTo = null } = {}) {
  const safeReturnTo = returnTo && isSafeReturnPath(returnTo) ? returnTo : null;

  if (!business) {
    return { type: 'internal', path: '/business-registration' };
  }

  if (safeReturnTo) {
    return { type: 'internal', path: safeReturnTo };
  }

  if (hasMultipleBusinesses) {
    return { type: 'internal', path: '/dashboard' };
  }

  if (!isOnboardingComplete(business)) {
    return { type: 'internal', path: '/onboarding' };
  }

  if (!business?.slug) {
    return { type: 'internal', path: '/business-configuration' };
  }

  return { type: 'external', url: getPublicCatalogUrl(business.slug) };
}
