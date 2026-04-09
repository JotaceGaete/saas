/**
 * OG image validation utilities.
 * Used to gate catalog-sharing flows that generate WhatsApp link previews.
 *
 * WhatsApp (and most link-preview crawlers) cache the OG image on first access.
 * If the image is missing at share time, no retry will fix it without a cache purge.
 * These helpers allow soft-gating share actions before that window closes.
 */

/**
 * Returns true when the business has at least one image that Ventalink
 * can expose as the OG preview image for the public catalog.
 *
 * Priority order mirrors the catalog OG tag logic:
 *   1. designSettings.shareImageUrl — explicit share image
 *   2. coverImageUrl — already merges headerImageUrl / coverImageUrl / cover_image_url
 *   3. designSettings.headerImageUrl / coverImageUrl — raw fallbacks (safe to re-check)
 *   4. logoUrl — last resort; still better than no image
 *
 * @param {object|null|undefined} business  — mapped business object from AuthContext
 * @returns {boolean}
 */
export function hasValidOgImage(business) {
  if (!business) return false;

  const ds = business.designSettings;

  return !!(
    ds?.shareImageUrl   ||
    business.coverImageUrl ||
    ds?.headerImageUrl  ||
    ds?.coverImageUrl   ||
    business.logoUrl
  );
}
