import React, { useState } from 'react';
import Icon from '../AppIcon';
import Button from './Button';

/**
 * AppErrorMessage — componente visual unificado para errores.
 *
 * Props:
 *  title          string  — título corto (default: "Algo salió mal")
 *  message        string  — explicación humana para el usuario
 *  errorId        string  — código corto para soporte (ej. "A3F1B2C4")
 *  technicalDetail string — detalle técnico oculto (solo para Copiar / soporte)
 *  onRetry        fn      — si se pasa, muestra botón "Intentar nuevamente"
 *  onBack         fn | string — si se pasa, muestra botón "Volver" (fn o ruta)
 *  fullPage       bool    — si true, ocupa pantalla completa (para ErrorBoundary)
 *  compact        bool    — variante inline pequeña para dentro de formularios
 */
export default function AppErrorMessage({
  title = 'Algo salió mal',
  message = 'Ocurrió un error inesperado. Intenta nuevamente.',
  errorId,
  technicalDetail,
  onRetry,
  onBack,
  fullPage = false,
  compact = false,
}) {
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const handleCopy = async () => {
    const text = [
      errorId ? `Código: ${errorId}` : '',
      technicalDetail || message,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  };

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
    } else if (typeof onBack === 'string') {
      window.location.href = onBack;
    } else {
      window.history.back();
    }
  };

  // ── Variante inline / compacta (dentro de formularios) ─────────────────
  if (compact) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl p-4"
        style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}
        role="alert"
      >
        <div className="flex items-start gap-2.5">
          <Icon name="AlertCircle" size={16} color="#EF4444" className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#B91C1C', fontFamily: 'var(--font-caption)' }}>
              {title}
            </p>
            <p className="text-sm mt-0.5" style={{ color: '#7F1D1D', fontFamily: 'var(--font-caption)' }}>
              {message}
            </p>
            {errorId && (
              <p className="text-xs mt-1" style={{ color: 'rgba(185,28,28,0.6)', fontFamily: 'var(--font-caption)' }}>
                Código: {errorId}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {onRetry && (
            <Button size="xs" variant="danger" onClick={onRetry}>
              <Icon name="RotateCcw" size={12} color="#fff" />
              Intentar nuevamente
            </Button>
          )}
          {(technicalDetail || errorId) && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs underline"
              style={{ color: 'rgba(185,28,28,0.5)', fontFamily: 'var(--font-caption)' }}
            >
              {copied ? 'Copiado' : 'Copiar detalle técnico'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Variante pantalla completa (ErrorBoundary, páginas de error) ────────
  if (fullPage) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--color-background, #f9fafb)' }}
      >
        <div className="flex flex-col items-center text-center gap-5 max-w-md w-full">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
          >
            <Icon name="AlertCircle" size={32} color="#EF4444" />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
              {title}
            </h1>
            <p className="text-base" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
              {message}
            </p>
            {errorId && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.6 }}>
                Código de error: <span className="font-mono">{errorId}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
            {onRetry && (
              <Button variant="default" onClick={onRetry}>
                <Icon name="RotateCcw" size={16} color="#fff" />
                Intentar nuevamente
              </Button>
            )}
            <Button variant="outline" onClick={handleBack}>
              <Icon name="ArrowLeft" size={16} color="currentColor" />
              Volver
            </Button>
          </div>

          {(technicalDetail || errorId) && (
            <div className="w-full">
              <button
                type="button"
                onClick={() => setShowDetail(v => !v)}
                className="text-xs underline"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.5 }}
              >
                {showDetail ? 'Ocultar detalle técnico' : 'Ver detalle técnico para soporte'}
              </button>
              {showDetail && (
                <div className="mt-2 p-3 rounded-lg text-left" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
                  <pre
                    className="text-xs whitespace-pre-wrap break-all"
                    style={{ color: 'var(--color-muted-foreground)', fontFamily: 'monospace' }}
                  >
                    {errorId ? `Código: ${errorId}\n` : ''}{technicalDetail || message}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs underline mt-2 block"
                    style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.6 }}
                  >
                    {copied ? 'Copiado' : 'Copiar para soporte'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Variante banner (dentro de página, sin ocupar pantalla completa) ────
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl p-5 sm:p-6 w-full"
      style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
        >
          <Icon name="AlertCircle" size={18} color="#EF4444" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#B91C1C', fontFamily: 'var(--font-caption)' }}>
            {title}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>
            {message}
          </p>
          {errorId && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.6 }}>
              Código de error: <span className="font-mono">{errorId}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onRetry && (
          <Button size="sm" variant="danger" onClick={onRetry}>
            <Icon name="RotateCcw" size={14} color="#fff" />
            Intentar nuevamente
          </Button>
        )}
        {onBack && (
          <Button size="sm" variant="outline" onClick={handleBack}>
            <Icon name="ArrowLeft" size={14} color="currentColor" />
            Volver
          </Button>
        )}
        {(technicalDetail || errorId) && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs underline ml-auto"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', opacity: 0.55 }}
          >
            {copied ? 'Copiado' : 'Copiar detalle para soporte'}
          </button>
        )}
      </div>
    </div>
  );
}
