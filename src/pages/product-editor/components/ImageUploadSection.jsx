import React, { useState, useRef } from 'react';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';
import { getProductImageMaxBytes, validateProductImageFile } from '../../../services/mediaUploadService';

const STATUS_PENDING = 'pending';
const STATUS_UPLOADING = 'uploading';
const STATUS_UPLOADED = 'uploaded';
const STATUS_ERROR = 'error';
const MAX_IMAGE_BYTES = getProductImageMaxBytes();
const MAX_IMAGE_MB = Math.max(1, Math.round(MAX_IMAGE_BYTES / (1024 * 1024)));

export default function ImageUploadSection({
  images,
  onImagesChange,
  businessId,
  onUploadRequested,
  disabled = false,
  uploadMessage = '',
  uploadError = '',
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverId, setDragOverId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [selectionError, setSelectionError] = useState('');
  const fileInputRef = useRef(null);

  const handleFiles = (files) => {
    if (disabled) return;
    const validatedFiles = Array.from(files || [])
      ?.map((file) => ({
        file,
        validationError: validateProductImageFile(file, { maxBytes: MAX_IMAGE_BYTES }),
      }));
    const firstError = validatedFiles.find(({ validationError }) => validationError)?.validationError || '';
    const fileArray = validatedFiles
      ?.filter(({ validationError }) => !validationError)
      ?.map(({ file }) => file);
    setSelectionError(firstError);
    if (fileArray?.length === 0) return;
    console.log('[ImageUploadSection] Archivos seleccionados', { count: fileArray.length, names: fileArray.map(f => f?.name) });
    const currentLength = (images || [])?.length;
    const toAdd = fileArray?.slice(0, Math.max(0, 5 - currentLength)) ?? [];
    const newItems = toAdd.map((file, index) => {
      const id = `img-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);
      return {
        id,
        url: previewUrl,
        alt: `Imagen de producto: ${file?.name}`,
        name: file?.name,
        file,
        status: STATUS_PENDING,
      };
    });
    onImagesChange(prev => {
      if ((prev || [])?.length >= 5) return prev;
      return [...(prev || []), ...newItems];
    });
    if (typeof onUploadRequested !== 'function') {
      console.warn('[ImageUploadSection] onUploadRequested no es función, imágenes quedarán en Pendiente');
    } else {
      newItems.forEach((item) => {
        console.log('[ImageUploadSection] Disparando onUploadRequested', item.id, 'businessId=', businessId);
        onUploadRequested(item.id, item.file, {
          isMainImage: currentLength === 0 && item.id === newItems?.[0]?.id,
        });
      });
    }
  };

  const handleDrop = (e) => { e?.preventDefault(); if (disabled) return; setIsDragging(false); handleFiles(e?.dataTransfer?.files); };
  const handleDragOver = (e) => { e?.preventDefault(); if (disabled) return; setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleFileInput = (e) => { handleFiles(e?.target?.files); e.target.value = ''; };
  const removeImage = (id) => {
    onImagesChange(prev => {
      const target = (prev || []).find((img) => img?.id === id);
      if (target?.url?.startsWith?.('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      return prev?.filter(img => img?.id !== id);
    });
  };

  // Drag-to-reorder handlers
  const handleItemDragStart = (e, id) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleItemDragOver = (e, id) => {
    e?.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggingId) setDragOverId(id);
  };
  const handleItemDrop = (e, targetId) => {
    e?.preventDefault();
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    onImagesChange(prev => {
      const arr = [...prev];
      const fromIdx = arr?.findIndex(i => i?.id === draggingId);
      const toIdx = arr?.findIndex(i => i?.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return arr;
      const [moved] = arr?.splice(fromIdx, 1);
      arr?.splice(toIdx, 0, moved);
      return arr;
    });
    setDraggingId(null);
    setDragOverId(null);
  };
  const handleItemDragEnd = () => { setDraggingId(null); setDragOverId(null); };

  return (
    <div>
      {images?.length < 5 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => { if (!disabled) fileInputRef?.current?.click(); }}
          className={`cursor-pointer rounded-2xl border border-dashed p-6 text-center transition-all duration-200 sm:p-7 ${
            isDragging
              ? 'scale-[1.005]'
              : 'hover:-translate-y-0.5'
          }`}
          style={{
            borderColor: isDragging ? 'rgba(17,24,39,0.36)' : 'rgba(17,24,39,0.12)',
            backgroundColor: isDragging ? 'rgba(17,24,39,0.04)' : 'rgba(255,255,255,0.54)',
            opacity: disabled ? 0.7 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
          role="button"
          tabIndex={0}
          aria-label="Subir imágenes del producto"
          onKeyDown={(e) => e?.key === 'Enter' && fileInputRef?.current?.click()}
        >
          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(17,24,39,0.06)' }}
            >
              <Icon name={isDragging ? 'Download' : 'ImagePlus'} size={20} color="var(--color-foreground)" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {isDragging ? 'Suelta aqui la imagen' : 'Agrega fotos para la ficha'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                PNG, JPG, WEBP - hasta 10 MB - max. {5 - (images?.length || 0)} mas
              </p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
        </div>
      )}
      {(uploadMessage || uploadError || selectionError) && (
        <div className="mt-3">
          {uploadMessage ? (
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {uploadMessage}
            </p>
          ) : null}
          {uploadError || selectionError ? (
            <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
              {uploadError || selectionError}
            </p>
          ) : null}
        </div>
      )}
      {images?.length > 0 && (
        <div className={`${images?.length < 5 ? 'mt-4' : ''}`}>
          {images?.length < 5 && (
            <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="GripVertical" size={12} color="var(--color-muted-foreground)" />
              Arrastra las miniaturas para reordenar · La primera imagen es la principal
            </p>
          )}
          {images?.length === 5 && (
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Límite de 5 imágenes alcanzado · Arrastra para reordenar
            </p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {images?.map((img, index) => (
              <div
                key={img?.id}
                draggable
                onDragStart={(e) => handleItemDragStart(e, img?.id)}
                onDragOver={(e) => handleItemDragOver(e, img?.id)}
                onDrop={(e) => handleItemDrop(e, img?.id)}
                onDragEnd={handleItemDragEnd}
                className="relative group rounded-xl overflow-hidden border-2 aspect-square cursor-grab active:cursor-grabbing transition-all duration-150"
                style={{
                  borderColor: dragOverId === img?.id
                    ? 'var(--color-primary)'
                    : index === 0
                    ? 'rgba(124,58,237,0.5)'
                    : 'var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  opacity: draggingId === img?.id ? 0.45 : 1,
                  transform: dragOverId === img?.id ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: dragOverId === img?.id ? '0 0 0 3px rgba(124,58,237,0.2)' : 'none',
                }}
              >
                <Image src={img?.url} alt={img?.alt} className="w-full h-full object-cover" />

                {/* Drag handle overlay */}
                <div
                  className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                >
                  <Icon name="GripVertical" size={11} color="#fff" />
                </div>

                {/* Primary badge */}
                {index === 0 && (
                  <span
                    className="absolute top-1 left-1 text-white rounded px-1.5 py-0.5 font-semibold"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      fontFamily: 'var(--font-caption)',
                      fontSize: '0.6rem',
                      lineHeight: '1.4',
                    }}
                  >
                    Principal
                  </span>
                )}

                {/* Upload status badge */}
                {img?.status === STATUS_PENDING && img?.file && (
                  <span
                    className="absolute bottom-1 left-1 rounded px-1 py-0.5"
                    style={{
                      backgroundColor: 'rgba(245,158,11,0.95)',
                      color: '#fff',
                      fontFamily: 'var(--font-caption)',
                      fontSize: '0.58rem',
                    }}
                  >
                    Pendiente
                  </span>
                )}
                {img?.status === STATUS_UPLOADING && (
                  <span
                    className="absolute bottom-1 left-1 rounded px-1 py-0.5 flex items-center gap-0.5"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      fontFamily: 'var(--font-caption)',
                      fontSize: '0.58rem',
                    }}
                  >
                    <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Subiendo...
                  </span>
                )}
                {img?.status === STATUS_ERROR && (
                  <div className="absolute inset-0 flex flex-col justify-end p-1.5 gap-0.5 bg-black/60 rounded-xl">
                    <span
                      className="rounded px-1 py-0.5 text-center"
                      style={{
                        backgroundColor: 'rgba(239,68,68,0.95)',
                        color: '#fff',
                        fontFamily: 'var(--font-caption)',
                        fontSize: '0.58rem',
                      }}
                    >
                      Error
                    </span>
                    {img?.error && (
                      <p
                        className="text-[0.5rem] leading-tight line-clamp-2 text-white/95 px-0.5"
                        style={{ fontFamily: 'var(--font-caption)' }}
                        title={img.error}
                      >
                        {img.error}
                      </p>
                    )}
                    {img?.file && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e?.stopPropagation();
                          if (disabled) return;
                          onUploadRequested?.(img?.id, img?.file, {
                            isMainImage: img?.id === images?.[0]?.id,
                          });
                        }}
                        className="rounded px-1 py-0.5 text-center text-white font-semibold"
                        style={{
                          backgroundColor: 'var(--color-primary)',
                          fontFamily: 'var(--font-caption)',
                          fontSize: '0.55rem',
                        }}
                      >
                        Reintentar
                      </button>
                    )}
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={(e) => { e?.stopPropagation(); if (!disabled) removeImage(img?.id); }}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                  style={{ backgroundColor: 'rgba(239,68,68,0.9)' }}
                  aria-label="Eliminar imagen"
                >
                  <Icon name="X" size={11} color="#fff" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
