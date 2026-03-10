import React from 'react';
import Image from 'components/AppImage';
import Icon from 'components/AppIcon';

const COVER_POSITION_MAP = { top: 'top', center: 'center', bottom: 'bottom' };

export default function StoreHeaderCard({
  storeName,
  storeSlug,
  logoUrl,
  coverImageUrl,
  businessLogoUrl,
  businessCoverImageUrl,
  coverFit,
  coverPosition,
  primaryColor,
  pendingLogoFile,
  pendingCoverFile,
  editingName,
  isSaving,
  onEditName,
  onCancelEdit,
  onSaveName,
  onSaveLogoAndCover,
  onNameChange,
  onSlugChange,
  onLogoClick,
  fileInputRef,
  onLogoFileChange,
  coverInputRef,
  onCoverFileChange,
  onCoverClick,
}) {
  const hasLogoOrCoverChanges = pendingLogoFile || pendingCoverFile ||
    (logoUrl && logoUrl !== businessLogoUrl) ||
    (coverImageUrl && coverImageUrl !== businessCoverImageUrl);
  const showSaveLogoCover = hasLogoOrCoverChanges && onSaveLogoAndCover;
  const fit = coverFit === 'contain' ? 'contain' : 'cover';
  const position = COVER_POSITION_MAP[coverPosition] || 'center';
  const bgWhenContain = primaryColor || 'var(--color-border)';
  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* Cover image section */}
      <div
        className="relative w-full h-28 overflow-hidden cursor-pointer group"
        onClick={onCoverClick}
        title="Cambiar imagen de portada"
        style={{
          background: coverImageUrl
            ? (fit === 'contain' ? bgWhenContain : undefined)
            : 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f4c2a 100%)',
        }}
      >
        {coverImageUrl && (
          <Image
            src={coverImageUrl}
            alt="Portada del negocio"
            className="w-full h-full"
            style={{
              objectFit: fit,
              objectPosition: fit === 'cover' ? position : 'center',
            }}
          />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Icon name="Camera" size={18} color="#fff" />
          <span className="text-white text-sm font-semibold">
            {coverImageUrl ? 'Cambiar portada' : 'Agregar portada'}
          </span>
        </div>
        {/* Label badge */}
        {!coverImageUrl && (
          <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
            <span className="text-xs text-white/70 font-medium">Sin imagen de portada — haz clic para agregar</span>
          </div>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onCoverFileChange}
        />
      </div>

      {/* Logo + name row */}
      <div className="px-6 py-5">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <button
            onClick={onLogoClick}
            className="relative flex-shrink-0 group focus:outline-none -mt-10"
            title="Cambiar logo"
            aria-label="Cambiar logo del negocio"
          >
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center border-4 border-white shadow-md"
              style={{
                backgroundColor: '#e8e8f0',
              }}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={`Logo de ${storeName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon name="User" size={28} color="#a0a0b8" />
              )}
            </div>
            <div
              className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Icon name="Camera" size={16} color="#fff" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogoFileChange}
            />
          </button>

          {/* Name & handle */}
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => onNameChange(e?.target?.value)}
                  className="w-full text-lg font-bold border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    borderColor: 'var(--color-primary)',
                    color: 'var(--color-foreground)',
                    boxShadow: '0 0 0 3px rgba(124,58,237,0.1)',
                  }}
                  placeholder="Nombre del negocio"
                  autoFocus
                />
                <input
                  type="text"
                  value={storeSlug}
                  onChange={(e) => onSlugChange(e?.target?.value?.toLowerCase()?.replace(/[^a-z0-9-]/g, '-'))}
                  className="w-full text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2"
                  style={{
                    fontFamily: 'var(--font-caption)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-muted-foreground)',
                  }}
                  placeholder="mi-tienda"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onSaveName}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                  >
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100"
                    style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0">
                  <p
                    className="text-lg font-bold text-foreground truncate"
                    style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}
                  >
                    {storeName || 'Mi Tienda'}
                  </p>
                  <p
                    className="text-sm truncate"
                    style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                  >
                    @{storeSlug || 'mi-tienda'}
                  </p>
                </div>
                <button
                  onClick={onEditName}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                  aria-label="Editar nombre del negocio"
                >
                  <Icon name="Pencil" size={14} color="var(--color-muted-foreground)" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Helper text and Save logo/cover button */}
        {!editingName && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Haz clic en la portada o el logo para cambiarlos.
              {showSaveLogoCover ? ' Haz clic en «Guardar logo y portada» para que se vean en tu catálogo público.' : ' Edita el nombre si quieres y guarda.'}
            </p>
            {showSaveLogoCover && (
              <button
                onClick={onSaveLogoAndCover}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                {isSaving ? 'Guardando...' : 'Guardar logo y portada'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
