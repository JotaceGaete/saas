import React, { useState, useRef } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";

export default function CatalogLinkWidget({ catalogUrl, businessName }) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const qrRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard?.writeText(catalogUrl)?.catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`¡Hola! Te comparto el catálogo de ${businessName}: ${catalogUrl}`)}`;

  const handleDownloadQR = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas?.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx?.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#000000';
    const pattern = [0,1,2,5,6,7,10,12,17,18,19,22,23,24,3,8,14,16,21];
    const cellSize = 28;
    const offset = 20;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const idx = row * 5 + col;
        if (pattern?.includes(idx)) {
          ctx?.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize - 2, cellSize - 2);
        }
      }
    }
    const link = document.createElement('a');
    link.download = `qr-${businessName || 'catalogo'}.png`;
    link.href = canvas?.toDataURL('image/png');
    link?.click();
  };

  const handleShareQR = async () => {
    if (navigator?.share) {
      try {
        await navigator.share({
          title: `Catálogo de ${businessName}`,
          text: `¡Visita nuestro catálogo!`,
          url: catalogUrl,
        });
      } catch {}
    } else {
      navigator.clipboard?.writeText(catalogUrl)?.catch(() => {});
    }
  };

  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    printWindow?.document?.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>QR - ${businessName || 'Catálogo'}</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
          .qr-box { border: 2px solid #000; padding: 20px; border-radius: 8px; display: inline-block; margin-bottom: 16px; }
          .qr-grid { display: grid; grid-template-columns: repeat(5, 28px); gap: 2px; }
          .qr-cell { width: 28px; height: 28px; border-radius: 3px; }
          .qr-cell.filled { background: #000; }
          .qr-cell.empty { background: transparent; }
          h2 { font-size: 20px; font-weight: bold; margin-bottom: 8px; }
          p { font-size: 12px; color: #555; word-break: break-all; max-width: 300px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h2>${businessName || 'Mi Catálogo'}</h2>
        <div class="qr-box">
          <div class="qr-grid">
            ${Array.from({ length: 25 })?.map((_, i) =>
              `<div class="qr-cell ${[0,1,2,5,6,7,10,12,17,18,19,22,23,24,3,8,14,16,21]?.includes(i) ? 'filled' : 'empty'}"></div>`
            )?.join('')}
          </div>
        </div>
        <p>Escanea para abrir el catálogo</p>
        <p style="margin-top:8px;">${catalogUrl}</p>
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow?.document?.close();
  };

  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon name="QrCode" size={16} color="var(--color-primary)" />
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Enlace del catálogo</h2>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg border mb-4" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
        <Icon name="Globe" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-data)' }}>{catalogUrl}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button variant={copied ? 'success' : 'outline'} iconName={copied ? 'Check' : 'Copy'} iconPosition="left" iconSize={13} size="sm" fullWidth onClick={handleCopy}>
          {copied ? '¡Copiado!' : 'Copiar'}
        </Button>
        <a
          href={whatsappShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
          aria-label="Compartir catálogo por WhatsApp"
        >
          <Icon name="MessageCircle" size={13} color="#fff" />
          WhatsApp
        </a>
      </div>
      <button
        onClick={() => setShowQR(!showQR)}
        className="flex items-center gap-1.5 text-xs font-medium hover:underline focus-visible:outline-none"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
      >
        <Icon name={showQR ? 'ChevronUp' : 'QrCode'} size={12} color="var(--color-primary)" />
        {showQR ? 'Ocultar QR' : 'Generar QR'}
      </button>
      {showQR && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div ref={qrRef} className="w-28 h-28 rounded-lg border flex items-center justify-center" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }} aria-label="Código QR del catálogo">
            <div className="grid grid-cols-5 gap-0.5 p-2">
              {Array.from({ length: 25 })?.map((_, i) => (
                <div key={i} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: [0,1,2,5,6,7,10,12,17,18,19,22,23,24,3,8,14,16,21]?.includes(i) ? 'var(--color-foreground)' : 'transparent' }} />
              ))}
            </div>
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Escanea para abrir el catálogo</p>
          <div className="grid grid-cols-3 gap-2 w-full mt-1">
            <button
              onClick={handleDownloadQR}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all hover:bg-muted active:scale-95"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="Download" size={14} color="var(--color-primary)" />
              Descargar QR
            </button>
            <button
              onClick={handleShareQR}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all hover:bg-muted active:scale-95"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="Share2" size={14} color="#25D366" />
              Compartir QR
            </button>
            <button
              onClick={handlePrintQR}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all hover:bg-muted active:scale-95"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="Printer" size={14} color="var(--color-primary)" />
              Imprimir QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}