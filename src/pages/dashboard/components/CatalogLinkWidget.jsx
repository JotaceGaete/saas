import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import { getCatalogShareMessage } from "../../../utils/branding";
import { isIOSDevice, openWhatsAppUrl } from "../../../utils/openWhatsAppUrl";
import { useOgGuard } from "../../../hooks/useOgGuard";
import OgShareGuardModal from "./OgShareGuardModal";

export default function CatalogLinkWidget({
  catalogUrl,
  offersUrl = '',
  businessName,
  businessPlanSlug,
  onCatalogShare,
  business = null,
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [copiedOffers, setCopiedOffers] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const qrRef = useRef(null);
  const shareMessage = getCatalogShareMessage({
    businessName,
    catalogUrl,
    plan: businessPlanSlug,
  });

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const { guardShare, ogGuardState } = useOgGuard(business, navigate);

  const handleWhatsAppShare = () => {
    guardShare(() => {
      openWhatsAppUrl(whatsappShareUrl);
      onCatalogShare?.();
    });
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(catalogUrl || '')?.catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyOffers = () => {
    navigator.clipboard?.writeText(offersUrl || '')?.catch(() => {});
    setCopiedOffers(true);
    setTimeout(() => setCopiedOffers(false), 2000);
  };

  const handleWhatsAppOffers = () => {
    if (!offersUrl) return;
    openWhatsAppUrl(`https://wa.me/?text=${encodeURIComponent(`🏷️ Mira las ofertas de ${businessName}: ${offersUrl}`)}`);
  };

  const handleRefreshPreview = () => {
    if (!catalogUrl) return;
    // URL canónica sin query: el crawler usa og:url / mismo HTML; el bust de imagen va en `/api/og-catalog?v=…` (servidor).
    const shareLink = catalogUrl;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareLink)}`;
    if (isIOSDevice()) {
      window.location.assign(waUrl);
      void navigator.clipboard?.writeText(shareLink).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(shareLink).catch(() => {});
      openWhatsAppUrl(waUrl);
    }
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 4000);
  };

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
          text: shareMessage,
          url: catalogUrl,
        });
      } catch {}
    } else {
      navigator.clipboard?.writeText(catalogUrl || '')?.catch(() => {});
    }
    onCatalogShare?.();
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
    <div className="dashboard-premium-card rounded-2xl border-0 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="QrCode" size={16} color="var(--color-primary)" />
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Enlace del catálogo</h2>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg border mb-4" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
        <Icon name="Globe" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-data)' }}>{catalogUrl}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: copied ? 'rgba(16,185,129,0.12)' : 'rgba(124,58,237,0.08)',
            color: copied ? '#059669' : 'var(--color-primary)',
            fontFamily: 'var(--font-caption)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.25)' : 'var(--color-border)'}`,
          }}
        >
          <Icon name={copied ? 'Check' : 'Copy'} size={13} color={copied ? '#059669' : 'var(--color-primary)'} />
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
        <a
          href={catalogUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: 'rgba(14,165,233,0.08)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.2)', fontFamily: 'var(--font-caption)' }}
          aria-label="Ver catálogo"
        >
          <Icon name="ExternalLink" size={13} color="#0EA5E9" />
          Ver
        </a>
        <button
          type="button"
          onClick={handleWhatsAppShare}
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
          aria-label="Compartir catálogo por WhatsApp"
        >
          <Icon name="MessageCircle" size={13} color="#fff" />
          WA
        </button>
      </div>
      <button
        type="button"
        onClick={handleRefreshPreview}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 hover:opacity-90 active:scale-95 mb-3"
        style={{
          backgroundColor: refreshed ? 'rgba(16,185,129,0.08)' : 'rgba(124,58,237,0.06)',
          color: refreshed ? '#059669' : 'var(--color-primary)',
          border: `1px solid ${refreshed ? 'rgba(16,185,129,0.25)' : 'var(--color-border)'}`,
          fontFamily: 'var(--font-caption)',
        }}
      >
        <Icon name={refreshed ? 'Check' : 'RefreshCw'} size={12} color={refreshed ? '#059669' : 'var(--color-primary)'} />
        {refreshed ? 'Enlace copiado — compártelo en WhatsApp' : 'Actualizar vista previa de WhatsApp'}
      </button>
      {!refreshed && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Si la vista previa no refleja tus cambios, usa este botón para compartir una versión actualizada del enlace.
        </p>
      )}
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

      {/* Sección de ofertas */}
      {offersUrl && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🏷️</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Link de ofertas
            </span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg border mb-2" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
            <Icon name="Tag" size={12} color="var(--color-muted-foreground)" className="flex-shrink-0" />
            <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-data)' }}>{offersUrl}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyOffers}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: copiedOffers ? 'rgba(16,185,129,0.12)' : 'rgba(124,58,237,0.08)',
                color: copiedOffers ? '#059669' : 'var(--color-primary)',
                fontFamily: 'var(--font-caption)',
                border: `1px solid ${copiedOffers ? 'rgba(16,185,129,0.25)' : 'var(--color-border)'}`,
              }}
            >
              <Icon name={copiedOffers ? 'Check' : 'Copy'} size={13} color={copiedOffers ? '#059669' : 'var(--color-primary)'} />
              {copiedOffers ? '¡Copiado!' : 'Copiar link'}
            </button>
            <button
              type="button"
              onClick={handleWhatsAppOffers}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#25D366', fontFamily: 'var(--font-caption)' }}
            >
              <Icon name="MessageCircle" size={13} color="#fff" />
              Compartir WA
            </button>
          </div>
        </div>
      )}

      <OgShareGuardModal {...ogGuardState} />
    </div>
  );
}