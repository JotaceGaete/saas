import React, { useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import {
  getProductVideoMaxBytes,
  replaceProductVideo,
  removeProductVideo,
  validateProductVideoFile,
} from '../../../services/productMediaService';

function withMediaVersion(url, version) {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}

const MAX_VIDEO_BYTES = getProductVideoMaxBytes();
const MAX_VIDEO_MB = Math.max(1, Math.round(MAX_VIDEO_BYTES / (1024 * 1024)));

export default function VideoUploadSection({ productId, businessId, video, onVideoChange }) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  const hasVideo = !!video?.videoUrl;

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateProductVideoFile(file, { maxBytes: MAX_VIDEO_BYTES });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const product = { id: productId, videoPath: video?.videoPath, videoThumbnailPath: video?.videoThumbnailPath };
      const uploaded = await replaceProductVideo({ file, product, businessId });
      setCacheBust(Date.now());
      onVideoChange({
        videoUrl: uploaded.video_url,
        videoThumbnailUrl: null,
        videoPath: uploaded.video_path,
        videoThumbnailPath: null,
      });
    } catch (err) {
      setError(err.message || 'Error al subir el video');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Quitar el video de este producto?')) return;
    setError(null);
    setLoading(true);
    try {
      await removeProductVideo(productId, {
        videoPath: video?.videoPath,
        videoThumbnailPath: video?.videoThumbnailPath,
      });
      onVideoChange(null);
    } catch (err) {
      setError(err.message || 'Error al quitar el video');
    } finally {
      setLoading(false);
    }
  };

  if (!productId) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-xl border"
        style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.25)' }}
      >
        <Icon name="Info" size={16} color="#d97706" className="flex-shrink-0" />
        <p className="text-sm" style={{ color: '#d97706', fontFamily: 'var(--font-caption)' }}>
          Guarda el producto primero para poder subir un video.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasVideo ? (
        <div className="space-y-3">
          <video
            src={withMediaVersion(video.videoUrl, cacheBust)}
            controls
            className="w-full rounded-xl border"
            style={{ borderColor: 'var(--color-border)', maxHeight: 280, backgroundColor: '#000' }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="RefreshCw" size={13} color="var(--color-primary)" />
              Reemplazar video
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleRemove}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#dc2626', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="Trash2" size={13} color="#dc2626" />
              Quitar video
            </button>
            {loading && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                <span className="inline-block w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                Subiendo...
              </span>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => !loading && fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 hover:border-primary/50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-muted)',
            borderRadius: 'var(--radius-md)',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          role="button"
          tabIndex={0}
          aria-label="Subir video del producto"
          onKeyDown={(e) => e.key === 'Enter' && !loading && fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
              {loading
                ? <span className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                : <Icon name="Video" size={20} color="var(--color-primary)" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {loading ? 'Subiendo video...' : 'Agregar video del producto'}
              </p>
              {!loading && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  MP4, MOV, WEBM · hasta {MAX_VIDEO_MB} MB
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <Icon name="AlertCircle" size={14} color="var(--color-error)" className="flex-shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
