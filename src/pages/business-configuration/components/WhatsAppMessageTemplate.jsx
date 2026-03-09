import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';

const DEFAULT_TEMPLATE = `Hola, quiero hacer este pedido en {store_name}:

{items}

Total estimado: {total}

Nombre:
Dirección:
Comentario:`;

const SAMPLE_DATA = {
  store_name: 'Mi Tienda',
  items: '• Producto A x2 — $5.000\n• Producto B x1 — $3.000',
  total: '$13.000',
};

const VARIABLES = [
  { key: '{store_name}', description: 'nombre del negocio' },
  { key: '{items}', description: 'lista de productos seleccionados' },
  { key: '{total}', description: 'total estimado del pedido' },
];

function renderPreview(template, data) {
  return template
    ?.replace(/\{store_name\}/g, data?.store_name)
    ?.replace(/\{items\}/g, data?.items)
    ?.replace(/\{total\}/g, data?.total);
}

export default function WhatsAppMessageTemplate({ value, onChange, isSaving, onSave }) {
  const [template, setTemplate] = useState(value || DEFAULT_TEMPLATE);

  useEffect(() => {
    if (value !== undefined && value !== template) {
      setTemplate(value || DEFAULT_TEMPLATE);
    }
  }, [value]);

  const handleChange = (val) => {
    setTemplate(val);
    onChange?.(val);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
    onChange?.(DEFAULT_TEMPLATE);
  };

  const preview = renderPreview(template, SAMPLE_DATA);

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: '#ffffff',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-caption)',
  };

  return (
    <div
      className="rounded-2xl border p-6 lg:p-8 mt-6"
      style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
    >
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(37,211,102,0.12)' }}
        >
          <Icon name="MessageSquare" size={18} color="#25D366" />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
            Plantilla de mensaje de pedido
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Personaliza el mensaje que se enviará por WhatsApp al recibir un pedido
          </p>
        </div>
      </div>

      {/* Two-column layout: editor left, preview right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: editor + variables help */}
        <div className="flex flex-col gap-4">
          {/* Template editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}
              >
                Plantilla del mensaje
              </label>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="RotateCcw" size={12} color="var(--color-text-tertiary)" />
                Restablecer
              </button>
            </div>
            <textarea
              rows={10}
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none"
              style={{ ...inputStyle, lineHeight: '1.6' }}
              value={template}
              onChange={e => handleChange(e?.target?.value)}
              placeholder={DEFAULT_TEMPLATE}
            />
          </div>

          {/* Variables help panel */}
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon name="Info" size={14} color="var(--color-primary)" />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                Variables disponibles
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {VARIABLES?.map(v => (
                <div key={v?.key} className="flex items-start gap-2">
                  <code
                    className="text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                    style={{
                      backgroundColor: 'rgba(139,92,246,0.12)',
                      color: 'var(--color-primary)',
                      border: '1px solid rgba(139,92,246,0.2)',
                    }}
                  >
                    {v?.key}
                  </code>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)', paddingTop: '2px' }}>
                    → {v?.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#25D366' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.5l5.797-1.522A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.898 0-3.67-.52-5.184-1.424l-.371-.22-3.441.902.919-3.354-.242-.386A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
              Vista previa del mensaje
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(37,211,102,0.1)', color: '#16a34a', fontFamily: 'var(--font-caption)' }}
            >
              En vivo
            </span>
          </div>

          {/* WhatsApp bubble */}
          <div
            className="rounded-2xl p-4 flex-1 min-h-[280px]"
            style={{
              background: 'linear-gradient(135deg, #e5ddd5 0%, #ddd5cc 100%)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {/* Message bubble */}
            <div className="flex justify-end">
              <div
                className="rounded-2xl rounded-tr-sm px-4 py-3 max-w-[90%] shadow-sm"
                style={{ backgroundColor: '#dcf8c6' }}
              >
                <pre
                  className="text-sm whitespace-pre-wrap break-words"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: '#111b21',
                    lineHeight: '1.5',
                    margin: 0,
                  }}
                >
                  {preview}
                </pre>
                <div className="flex items-center justify-end gap-1 mt-1.5">
                  <span className="text-xs" style={{ color: '#667781' }}>ahora</span>
                  <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                    <path d="M11.071.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.154.093l-3-3a.75.75 0 0 1 1.06-1.06l2.4 2.4 4.972-6.803a.75.75 0 0 1 1.046-.176z" fill="#53bdeb" />
                    <path d="M14.571.653a.75.75 0 0 1 .176 1.046l-5.5 7.5a.75.75 0 0 1-1.154.093l-.5-.5a.75.75 0 0 1 1.06-1.06l.023.023 4.849-6.626a.75.75 0 0 1 1.046-.176z" fill="#53bdeb" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            * La vista previa usa datos de ejemplo. El mensaje real usará los datos del pedido.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center justify-end gap-3 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
          style={{
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            backgroundColor: '#ffffff',
            fontFamily: 'var(--font-caption)',
          }}
        >
          Restablecer plantilla
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
            fontFamily: 'var(--font-caption)',
            boxShadow: '0 2px 8px rgba(37,211,102,0.35)',
          }}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Guardando...
            </>
          ) : (
            <>
              <Icon name="Save" size={14} color="#fff" />
              Guardar plantilla
            </>
          )}
        </button>
      </div>
    </div>
  );
}
