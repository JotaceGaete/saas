/**
 * OG image validation utilities.
 * Used to gate catalog-sharing flows that generate WhatsApp link previews.
 *
 * WhatsApp (and most link-preview crawlers) cache the OG image on first access.
 * If the image is missing at share time, no retry will fix it without a cache purge.
 * These helpers allow soft-gating share actions before that window closes.
 */

/**
 * Returns true when the business has a dedicated share image configured.
 *
 * We only check shareImageUrl because that is the image the user explicitly
 * configured for sharing — it is guaranteed to be properly sized (1200×630)
 * and safe for WhatsApp crawlers. Other images (cover, logo) may be large
 * raw uploads or wrong aspect ratios, and are handled as fallbacks by the
 * OG resolution layer, not as a "configured" state from the user's perspective.
 *
 * @param {object|null|undefined} business  — mapped business object from AuthContext
 * @returns {boolean}
 */
export function hasValidOgImage(business) {
  if (!business) return false;
  return !!(business.designSettings?.shareImageUrl);
}
