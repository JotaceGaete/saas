import React from 'react';
import { cfImageUrl, isCfTransformableUrl } from '../utils/cloudflareImage';
import { useResponsiveCfImageProfile } from '../hooks/useResponsiveCfImageProfile';

/**
 * @param {'thumbnail'|'mobile'|'desktop'|'responsive'|undefined} [cfProfile] — omitir para no transformar (previews blob / locales).
 */
function Image({
  src,
  alt = "Image Name",
  className = "",
  cfProfile,
  ...props
}) {
  const responsive = useResponsiveCfImageProfile();
  const resolved = cfProfile === 'responsive' ? responsive : cfProfile;
  const displaySrc =
    resolved != null && src ? cfImageUrl(src, resolved) : src;

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        if (src && isCfTransformableUrl(src) && el.getAttribute('data-cf-fallback') !== '1') {
          el.setAttribute('data-cf-fallback', '1');
          el.src = src;
          return;
        }
        el.onerror = null;
        el.src = '/assets/images/no_image.png';
      }}
      {...props}
    />
  );
}

export default Image;
