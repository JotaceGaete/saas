import React, { useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import Image from 'components/AppImage';

export default function LogoUpload({ logo, logoAlt, onLogoChange }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file) => {
    if (!file || !file?.type?.startsWith('image/')) return;
    const previewUrl = URL.createObjectURL(file);
    onLogoChange(previewUrl, `Logo de negocio`, file);
  };

  const handleFileInput = (e) => { const file = e?.target?.files?.[0]; if (file) handleFile(file); e.target.value = ''; };
  const handleDrop = (e) => { e?.preventDefault(); setIsDragging(false); const file = e?.dataTransfer?.files?.[0]; if (file) handleFile(file); };
  const handleDragOver = (e) => { e?.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleRemove = () => { onLogoChange('', '', null); };

  return (
    <div className="flex items-start gap-4">
      <div className="relative w-20 h-20 rounded-xl border-2 flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ borderColor: logo ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: logo ? 'transparent' : 'var(--color-muted)' }}>
        {logo ? (
          <>
            <Image src={logo} alt={logoAlt || 'Logo del negocio'} className="w-full h-full object-cover" />
            <button onClick={handleRemove} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Eliminar logo">
              <Icon name="X" size={10} color="#fff" />
            </button>
          </>
        ) : (
          <Icon name="Building2" size={24} color="var(--color-muted-foreground)" />
        )}
      </div>
      <div className="flex-1">
        <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={() => fileInputRef?.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{isDragging ? 'Suelta el logo aquí' : logo ? 'Cambiar logo' : 'Subir logo'}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>PNG, JPG, WEBP hasta 5MB</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
        </div>
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Recomendado: imagen cuadrada de al menos 200×200px</p>
      </div>
    </div>
  );
}