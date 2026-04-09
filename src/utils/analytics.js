/**
 * Traffic source detection utilities.
 * Extensible for future tracking (WhatsApp clicks, conversions, etc.)
 */

const SOURCE_RULES = [
  { key: 'instagram', patterns: ['instagram.com'] },
  { key: 'facebook',  patterns: ['facebook.com', 'fb.com'] },
  { key: 'tiktok',    patterns: ['tiktok.com'] },
  { key: 'google',    patterns: ['google.com', 'google.co'] },
  { key: 'whatsapp',  patterns: ['whatsapp.com', 'wa.me'] },
  { key: 'twitter',   patterns: ['twitter.com', 'x.com', 't.co'] },
];

function hostnameMatches(url, patterns) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = url.toLowerCase();
  }
  return patterns.some((p) => hostname === p || hostname.endsWith('.' + p));
}

/**
 * Detect traffic source from utm_source param and document.referrer.
 * Returns one of: instagram | facebook | tiktok | google | whatsapp | twitter | direct
 *
 * @param {{ utmSource?: string, referrer?: string }} options
 * @returns {string}
 */
export function getTrafficSource({ utmSource, referrer } = {}) {
  if (utmSource) {
    const utm = utmSource.toLowerCase().trim();
    for (const { key } of SOURCE_RULES) {
      if (utm === key) return key;
    }
    return utm; // preserve custom utm values
  }

  if (referrer) {
    for (const { key, patterns } of SOURCE_RULES) {
      if (hostnameMatches(referrer, patterns)) return key;
    }
  }

  return 'direct';
}

/**
 * Collect all visit attribution data from the current browser context.
 * Captures: source, referrer, utm_source, utm_medium, utm_campaign.
 *
 * @returns {{ source: string, referrer: string|null, utm_source: string|null, utm_medium: string|null, utm_campaign: string|null }}
 */
export function collectVisitAttribution() {
  if (typeof window === 'undefined') {
    return { source: 'direct', referrer: null, utm_source: null, utm_medium: null, utm_campaign: null };
  }

  const params = new URLSearchParams(window.location.search);
  const utmSource   = params.get('utm_source')   || null;
  const utmMedium   = params.get('utm_medium')   || null;
  const utmCampaign = params.get('utm_campaign') || null;
  const referrer    = document.referrer          || null;

  const source = getTrafficSource({ utmSource, referrer });

  return { source, referrer, utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign };
}

export const SOURCE_LABELS = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  google:    'Google',
  whatsapp:  'WhatsApp',
  twitter:   'Twitter / X',
  direct:    'Directo',
};

/**
 * Returns a display label for a source key, with fallback to the raw value.
 * @param {string} source
 * @returns {string}
 */
export function getSourceLabel(source) {
  return SOURCE_LABELS[source] ?? source ?? 'Directo';
}

/**
 * Per-source color palette for charts and badges.
 * Used in Dashboard and Admin analytics sections.
 */
export const SOURCE_COLORS = {
  instagram: { dot: '#E1306C', bar: 'rgba(225,48,108,0.75)',  bg: 'rgba(225,48,108,0.10)',  text: '#BE185D' },
  facebook:  { dot: '#1877F2', bar: 'rgba(24,119,242,0.75)',  bg: 'rgba(24,119,242,0.10)',  text: '#1D4ED8' },
  tiktok:    { dot: '#2DD4BF', bar: 'rgba(45,212,191,0.75)',  bg: 'rgba(45,212,191,0.12)',  text: '#0F766E' },
  google:    { dot: '#EA4335', bar: 'rgba(234,67,53,0.75)',   bg: 'rgba(234,67,53,0.10)',   text: '#B91C1C' },
  whatsapp:  { dot: '#25D366', bar: 'rgba(37,211,102,0.75)',  bg: 'rgba(37,211,102,0.12)',  text: '#15803D' },
  twitter:   { dot: '#1DA1F2', bar: 'rgba(29,161,242,0.75)',  bg: 'rgba(29,161,242,0.10)',  text: '#0369A1' },
  direct:    { dot: '#7C3AED', bar: 'rgba(124,58,237,0.65)',  bg: 'rgba(124,58,237,0.10)',  text: 'var(--color-primary)' },
};

/**
 * Returns the color config for a given source key, with a neutral fallback.
 * @param {string} src
 */
export function getSourceColors(src) {
  return SOURCE_COLORS[src] ?? { dot: '#94A3B8', bar: 'rgba(148,163,184,0.65)', bg: 'rgba(148,163,184,0.10)', text: '#475569' };
}
