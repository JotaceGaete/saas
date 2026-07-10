/**
 * OG image validation utilities.
 * Used to gate catalog-sharing flows that generate WhatsApp link previews.
 *
 * WhatsApp (and most link-preview crawlers) cache the OG image on first access.
 * If the image is missing at share time, no retry will fix it without a cache purge.
 * These helpers allow soft-gating share actions before that window closes.
 */

/**
 * Returns true when the business has ANY source image that /api/og-catalog
 * would use for a real (non-generic) preview — same priority order as the
 * backend (api/og-catalog.js): explicit share image → cover → logo.
 *
 * This does not gate whether sharing is possible: /api/og-catalog always
 * returns a 200 PNG (falling back to a generic gradient card when none of
 * these exist), so a false here just means "the first scrape may show the
 * generic card instead of a photo," not "sharing will fail."
 *
 * @param {object|null|undefined} business  — mapped business object from AuthContext
 * @returns {boolean}
 */
export function hasValidOgImage(business) {
  if (!business) return false;
  return !!(
    business.designSettings?.shareImageUrl ||
    business.coverImageUrl ||
    business.logoUrl
  );
}
