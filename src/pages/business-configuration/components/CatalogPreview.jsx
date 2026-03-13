import React from 'react';
import Image from 'components/AppImage';
import Icon from 'components/AppIcon';
import { getCountryLabels } from 'config/country';

export default function CatalogPreview({ config }) {
  const labels = getCountryLabels();
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div
          className="flex-1 mx-2 px-3 py-1 rounded text-xs text-muted-foreground truncate"
          style={{ backgroundColor: 'var(--color-card)', fontFamily: 'var(--font-data)' }}
        >
          catalogoapp.com/{config?.slug || 'mi-negocio'}
        </div>
      </div>
      {/* Catalog header preview */}
      <div style={{ backgroundColor: 'var(--color-background)' }} className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-muted)' }}
          >
            {config?.logo ? (
              <Image
                src={config?.logo}
                alt="Vista previa del logo del negocio en el catálogo público para clientes"
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon name="Building2" size={22} color="var(--color-muted-foreground)" />
            )}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              {config?.nombre || 'Nombre del negocio'}
            </p>
            <p className="text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-caption)' }}>
              {config?.city || config?.ciudad ? `${config?.city || config?.ciudad}, ${config?.country || config?.pais || labels.countryName}` : `${labels.cityLabel}, ${labels.countryName}`}
            </p>
          </div>
        </div>
        {config?.descripcion && (
          <p className="text-xs text-muted-foreground line-clamp-2" style={{ fontFamily: 'var(--font-body)' }}>
            {config?.descripcion}
          </p>
        )}
        {/* Mock product cards */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          {[1, 2]?.map((i) => (
            <div
              key={i}
              className="rounded-lg overflow-hidden border"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
            >
              <div className="h-16 skeleton" />
              <div className="p-2">
                <div className="h-2 skeleton rounded mb-1 w-3/4" />
                <div className="h-2 skeleton rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}