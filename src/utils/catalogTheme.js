/**
 * Catalog visual theme utilities.
 *
 * Responsibilities:
 *   1. getTextColorForBg(hex)  — WCAG-based automatic text color for any background
 *   2. CATALOG_TEMPLATES       — preset background styles (light / dark / pastel)
 *   3. resolveCatalogTheme(design) — merges template + overrides into a full token set
 *
 * Design contract:
 *   - Text color is ALWAYS computed automatically from the background. Never read from user input.
 *   - Template sets base bg + card bg + border colors.
 *   - design.backgroundColor overrides only the page bg (text color is re-computed from it).
 *   - Existing catalogs with no template/backgroundColor default to 'light'.
 */

// ── Color math helpers ────────────────────────────────────────────────────────

/**
 * Parse a 3- or 6-digit hex string into [r, g, b] (0–255).
 * Returns the WhatsApp green fallback for unparseable input.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const h = (hex ?? '').replace(/^#/, '');
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [37, 211, 102]; // fallback: WhatsApp green
}

/** Returns rgba(r,g,b,alpha) for the given hex + alpha value. */
export function hexToRgba(hex, alpha = 0.4) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Returns a darkened version of hex (pct = fraction to darken, 0–1). */
export function darkenHex(hex, pct = 0.2) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - pct;
  return `#${[r, g, b]
    .map((x) => Math.max(0, Math.min(255, Math.round(x * f))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Mixes two hex colors. weight=1 → pure hex1, weight=0 → pure hex2.
 * Used to derive subtle tints without rgba transparency.
 * @param {string} hex1
 * @param {string} hex2
 * @param {number} weight - 0 to 1
 * @returns {string}
 */
export function mixHex(hex1, hex2, weight) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const w = Math.max(0, Math.min(1, weight));
  return `#${[
    Math.round(r1 * w + r2 * (1 - w)),
    Math.round(g1 * w + g2 * (1 - w)),
    Math.round(b1 * w + b2 * (1 - w)),
  ].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * WCAG 2.1 relative luminance for a single 8-bit channel value.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function channelLuminance(c8bit) {
  const sRGB = c8bit / 255;
  return sRGB <= 0.04045
    ? sRGB / 12.92
    : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

/**
 * Returns the relative luminance (0 = black, 1 = white) of a hex color.
 * @param {string} hex
 * @returns {number}
 */
export function getLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) +
         0.7152 * channelLuminance(g) +
         0.0722 * channelLuminance(b);
}

/**
 * Returns the accessible text color for a given background hex.
 * Uses WCAG contrast ratio: prefers dark text (#111111) when the background
 * is light enough to maintain ≥ 4.5:1 contrast against it.
 *
 * The user NEVER chooses this — it is always derived automatically.
 *
 * @param {string} hex  — background color
 * @returns {'#111111'|'#ffffff'}
 */
export function getTextColorForBg(hex) {
  // Contrast ratio against black (#000): (lum + 0.05) / 0.05
  // Contrast ratio against white (#fff): 1.05 / (lum + 0.05)
  // Threshold: choose whichever gives higher ratio.
  const lum = getLuminance(hex);
  const contrastWithBlack = (lum + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (lum + 0.05);
  return contrastWithBlack >= contrastWithWhite ? '#111111' : '#ffffff';
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true for valid 3- or 6-digit hex strings (with or without #).
 * @param {string|null|undefined} hex
 * @returns {boolean}
 */
export function isValidHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  return /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex.trim());
}

// ── Template presets ──────────────────────────────────────────────────────────

/**
 * Built-in catalog background templates.
 * `cardBg` and `borderColor` apply to product cards and sub-sections.
 * `bgColor` is the page canvas. Text color is always derived automatically.
 *
 * @type {Record<string, { id: string, label: string, bgColor: string, cardBg: string, borderColor: string }>}
 */
export const CATALOG_TEMPLATES = {
  light: {
    id:          'light',
    label:       'Claro',
    description: 'Fondo blanco neutro',
    bgColor:     '#f8f8fb',
    cardBg:      '#ffffff',
    borderColor: '#e5e7eb',
  },
  dark: {
    id:          'dark',
    label:       'Oscuro',
    description: 'Elegante y sofisticado',
    bgColor:     '#1a1a2e',
    cardBg:      '#16213e',
    borderColor: '#2d2d4e',
  },
  pastel: {
    id:          'pastel',
    label:       'Pastel',
    description: 'Suave y femenino',
    bgColor:     '#fdf6ff',
    cardBg:      '#ffffff',
    borderColor: '#e9d5ff',
  },
};

// ── Theme resolution ──────────────────────────────────────────────────────────

/**
 * Derives the complete visual token set for the public catalog from design_settings.
 *
 * Priority:
 *   1. design.backgroundColor (custom hex) overrides the template bg.
 *   2. design.template selects the preset (determines cardBg + borderColor).
 *   3. Fallback: 'light' template for every field.
 *
 * Never reads textColor from design — always computes it.
 *
 * @param {object|null|undefined} design — business.designSettings
 * @returns {{
 *   bgColor:          string,   // page canvas background
 *   textColor:        string,   // '#111111' | '#ffffff' — auto-computed
 *   cardBg:           string,   // product card background
 *   borderColor:      string,   // card + section borders
 *   primaryColor:     string,   // accent / CTA color
 *   primaryColorDark: string,   // darkened accent
 *   primaryRgba:      (alpha: number) => string,
 *   template:         string,   // resolved template id
 *   isDark:           boolean,  // true when textColor is white
 * }}
 */
export function resolveCatalogTheme(design) {
  const templateDef = CATALOG_TEMPLATES[design?.template] ?? CATALOG_TEMPLATES.light;

  // Custom bg overrides template bg only; card + border come from template
  const bgColor = isValidHex(design?.backgroundColor)
    ? design.backgroundColor.trim()
    : templateDef.bgColor;

  const textColor = getTextColorForBg(bgColor);

  const primaryColor = isValidHex(design?.primaryColor)
    ? design.primaryColor
    : '#25D366';

  const primaryColorDark = darkenHex(primaryColor, 0.2);

  const isDark = textColor === '#ffffff';
  const [pr, pg, pb] = hexToRgb(primaryColor);

  // Desktop lateral framing: solid tints derived by mixing primaryColor into bgColor.
  // Solid (not rgba) so the gradient is fully opaque — no white bleed on dark themes.
  const sideTint = mixHex(primaryColor, bgColor, isDark ? 0.15 : 0.07);
  const sideGlow = mixHex(primaryColor, bgColor, isDark ? 0.28 : 0.13);

  // Semantic UI tokens
  const sectionBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.018)';
  const chipBg    = `rgba(${pr},${pg},${pb},${isDark ? 0.22 : 0.11})`;
  const chipText  = isDark ? '#ffffff' : primaryColor;

  return {
    bgColor,
    textColor,
    cardBg:      templateDef.cardBg,
    borderColor: templateDef.borderColor,
    primaryColor,
    primaryColorDark,
    primaryRgba: (alpha) => hexToRgba(primaryColor, alpha),
    template:    templateDef.id,
    isDark,
    // Extended layout tokens
    pageBg:     bgColor,
    sideTint,
    sideGlow,
    sectionBg,
    chipBg,
    chipText,
  };
}
