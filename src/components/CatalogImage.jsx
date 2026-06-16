import React, { useEffect, useRef, useState } from 'react';
import Icon from './AppIcon';
import { isCfTransformableUrl } from '../utils/cloudflareImage';

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

/**
 * data: URLs (p. ej. logos SVG de template) no dependen de red: se marcan
 * como cargadas de inmediato. Si se esperara onLoad y el evento no llegara
 * a capturarse, la imagen quedaría invisible (opacity 0) mostrando solo el
 * placeholder gris aunque el src sea válido.
 */
const isDataUrl = (value) => typeof value === 'string' && value.startsWith('data:');

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
  imgKey,
  onLoad,
  onError,
  ...props
}) {
  const imgRef = useRef(null);
  const [currentSrc, setCurrentSrc] = useState(src || null);
  const [loaded, setLoaded] = useState(() => isDataUrl(src));
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setCurrentSrc(src || null);
    setLoaded(isDataUrl(src));
    setFailed(!src);
  }, [src, originalSrc]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || failed) return;
    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [currentSrc, failed]);

  const placeholder = PLACEHOLDER_STYLES[variant] || PLACEHOLDER_STYLES.product;
  const currentIsDataUrl = isDataUrl(currentSrc);
  const showImage = (loaded || currentIsDataUrl) && !failed;

  const handleLoad = (event) => {
    setLoaded(true);
    onLoad?.(event);
  };

  const handleError = (event) => {
    // Primer intento: volver a la URL original si la transformada falló
    const canFallbackToOriginal =
      !!originalSrc &&
      currentSrc !== originalSrc;

    if (canFallbackToOriginal) {
      setCurrentSrc(originalSrc);
      setLoaded(false);
      return;
    }

    setFailed(true);
    onError?.(event);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {!(currentIsDataUrl && !failed) && (
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${showImage ? 'opacity-0' : 'opacity-100'}`}
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
      )}

      {currentSrc && !failed ? (
        <img
          key={imgKey ?? currentSrc}
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          className={imgClassName}
          style={{
            ...imgStyle,
            opacity: showImage ? loadedOpacity : 0,
            visibility: showImage ? 'visible' : 'hidden',
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
