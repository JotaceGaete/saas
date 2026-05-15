import React, { useEffect, useState } from 'react';
import Icon from './AppIcon';
import { unwrapCfImageUrl } from '../utils/cloudflareImage';

const PLACEHOLDER_STYLES = {
  cover: {
    background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 45%, #cbd5e1 100%)',
    iconBg: 'rgba(255,255,255,0.76)',
    iconColor: '#64748B',
    iconName: 'Store',
  },
  logo: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    iconBg: 'rgba(255,255,255,0.88)',
    iconColor: '#64748B',
    iconName: 'Store',
  },
  product: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2f7 55%, #e2e8f0 100%)',
    iconBg: 'rgba(255,255,255,0.9)',
    iconColor: '#94A3B8',
    iconName: 'ImageOff',
  },
};

export default function CatalogImage({
  src,
  originalSrc = null,
  alt = '',
  className = '',
  imgClassName = '',
  style,
  imgStyle,
  variant = 'product',
  loading,
  fetchPriority,
  decoding = 'async',
  draggable,
  role,
  ariaHidden,
  loadedOpacity = 1,
  showFallbackIcon = true,
  onLoad,
  onError,
  debugContext = null,
  ...props
}) {
  const [currentSrc, setCurrentSrc] = useState(src || null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setCurrentSrc(src || null);
    setLoaded(false);
    setFailed(!src);
  }, [src, originalSrc]);

  const placeholder = PLACEHOLDER_STYLES[variant] || PLACEHOLDER_STYLES.product;

  const handleLoad = (event) => {
    setLoaded(true);
    onLoad?.(event);
  };

  const handleError = (event) => {
    const fallbackSrc = unwrapCfImageUrl(originalSrc) || originalSrc;
    const canFallbackToOriginal = !!fallbackSrc && currentSrc !== fallbackSrc;

    if (canFallbackToOriginal) {
      if (import.meta.env.DEV && debugContext) {
        console.debug('[CatalogImage] fallback to original image', {
          ...debugContext,
          originalSrc,
          transformedSrc: currentSrc,
          fallbackSrc,
        });
      }
      setCurrentSrc(fallbackSrc);
      setLoaded(false);
      return;
    }

    if (import.meta.env.DEV && debugContext) {
      console.warn('[CatalogImage] image failed', {
        ...debugContext,
        originalSrc,
        transformedSrc: currentSrc,
        fallbackSrc: null,
      });
    }
    setFailed(true);
    onError?.(event);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${loaded && !failed ? 'opacity-0' : 'opacity-100'}`}
        style={{ background: placeholder.background }}
        aria-hidden="true"
      >
        {showFallbackIcon && (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full shadow-sm animate-pulse"
            style={{ backgroundColor: placeholder.iconBg }}
          >
            <Icon name={placeholder.iconName} size={variant === 'product' ? 18 : 20} color={placeholder.iconColor} />
          </div>
        )}
      </div>

      {currentSrc && !failed ? (
        <img
          src={currentSrc}
          alt={alt}
          className={imgClassName}
          style={{
            ...imgStyle,
            opacity: loaded ? loadedOpacity : 0,
            visibility: loaded ? 'visible' : 'hidden',
            transition: 'opacity 220ms ease-out, transform 300ms ease-out',
          }}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={decoding}
          draggable={draggable}
          role={role}
          aria-hidden={ariaHidden}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      ) : null}
    </div>
  );
}
