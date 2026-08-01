import React from 'react';
import Icon from 'components/AppIcon';

export default function LocalOnlyImagesNotice({ visible }) {
  if (!visible) return null;

  return (
    <p
      role="status"
      className="mb-4 flex items-center gap-1.5 text-xs"
      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
    >
      <Icon name="Info" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
      El texto se guardó como borrador. Las imágenes nuevas deben volver a seleccionarse si recargas la página.
    </p>
  );
}
