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
 * @returns {{ source: string, referrer: string | null, utm_source: string | null }}
 */
export function collectVisitAttribution() {
  if (typeof window === 'undefined') {
    return { source: 'direct', referrer: null, utm_source: null };
  }

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source') || null;
  const referrer = document.referrer || null;

  const source = getTrafficSource({ utmSource, referrer });

  return { source, referrer, utm_source: utmSource };
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
