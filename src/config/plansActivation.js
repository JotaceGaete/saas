/**
 * Activación manual de planes (fuera de Chile, sin pasarela activa).
 * Opcional: VITE_PLANS_SUPPORT_WHATSAPP (dígitos sin +). Si no hay, usa {@link SUPPORT_WHATSAPP_NUMBER}.
 */

import { SUPPORT_WHATSAPP_NUMBER } from './support';

/**
 * @param {string} [userEmail] - Email del usuario logueado (se incluye en el mensaje).
 * @returns {string} URL wa.me
 */
export function getPlansActivationWhatsappUrl(userEmail) {
  const raw = import.meta.env?.VITE_PLANS_SUPPORT_WHATSAPP ?? '';
  const phone = String(raw).replace(/\D/g, '') || String(SUPPORT_WHATSAPP_NUMBER).replace(/\D/g, '');
  const base = `Hola, quiero solicitar la activación de un plan en Walinka (Pro o Full).`;
  const suffix = userEmail ? ` Mi cuenta: ${userEmail}` : '';
  const text = encodeURIComponent(`${base}${suffix}`);
  if (phone.length >= 8) {
    return `https://wa.me/${phone}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}
