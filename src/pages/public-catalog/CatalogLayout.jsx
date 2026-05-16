/**
 * CatalogLayout — full-viewport wrapper for the public catalog.
 *
 * On desktop (isDesktop=true):
 *   Applies a horizontal gradient that blends the primary-tinted `sideTint`
 *   into the neutral `pageBg`, giving the catalog gutters a framed look
 *   without adding any visible content in the margins.
 *
 *   Visual effect:
 *   [ sideTint → pageBg ] [ catalog content ] [ pageBg → sideTint ]
 *
 * On mobile (isDesktop=false):
 *   Flat `pageBg` background — no gutters to fill, gradient would bleed
 *   into the content area.
 *
 * The gradient uses a 10% stop so the tint fades out before reaching the
 * catalog's centered max-width container on most desktop resolutions.
 * At narrow desktop widths (≈ 768–1024 px) the tint overlaps slightly
 * into content but remains imperceptible at 7 % mix on light themes.
 *
 * @param {object}  props.theme      - result of resolveCatalogTheme(design)
 * @param {boolean} props.isDesktop  - from useIsDesktop(); drives gradient on/off
 * @param {string}  [props.className]
 * @param {object}  [props.style]    - merged into root div style (e.g. CSS vars)
 */
export default function CatalogLayout({ theme, isDesktop, className, style, children }) {
  const { pageBg, sideTint } = theme;

  const background = isDesktop
    ? `linear-gradient(to right, ${sideTint} 0%, ${pageBg} 10%, ${pageBg} 90%, ${sideTint} 100%)`
    : pageBg;

  return (
    <div className={className} style={{ background, ...style }}>
      <div className="w-full min-h-screen overflow-x-hidden">
        <div className="w-full max-w-[480px] mx-auto min-h-screen bg-white overflow-x-hidden lg:max-w-full lg:bg-transparent lg:overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}
