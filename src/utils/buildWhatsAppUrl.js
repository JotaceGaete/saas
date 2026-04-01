/**
 * @param {string} message
 * @param {string} phoneNumber - E.164 o dígitos (ej. +56993443682 o 56993443682)
 * @returns {string} URL wa.me con texto codificado
 */
export function buildWhatsAppUrl(message, phoneNumber) {
  const digits = String(phoneNumber ?? '').replace(/\D/g, '');
  if (!digits) return '#';
  const text = encodeURIComponent(message ?? '');
  return `https://wa.me/${digits}?text=${text}`;
}
