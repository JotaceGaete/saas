import React, { useCallback, useEffect, useRef, useState } from 'react';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ADMIN_EMAIL_TEMPLATES,
  buildBusinessOverrides,
  fetchAdminEmailPreview,
  getAdminEmailTestLogs,
  getMockForTemplate,
  sendAdminEmailTest,
} from '../../services/adminEmailService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function templateLabel(key) {
  return ADMIN_EMAIL_TEMPLATES.find((t) => t.key === key)?.label || key;
}

function parseMockJson(str) {
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ok: true, data: parsed };
    return { ok: false, error: 'Debe ser un objeto JSON {}' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminEmailsPage() {
  const navigate = useNavigate();
  const { user, business } = useAuth();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1400);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  // Template selector
  const [templateKey, setTemplateKey] = useState(ADMIN_EMAIL_TEMPLATES[0]?.key || 'welcome');

  // Mock data editor — se inicializa con defaults y se reemplaza con datos reales cuando business carga
  const [mockJson, setMockJson] = useState(() =>
    JSON.stringify(getMockForTemplate(ADMIN_EMAIL_TEMPLATES[0]?.key || 'welcome'), null, 2)
  );
  const [mockJsonError, setMockJsonError] = useState(null);
  const [showMockEditor, setShowMockEditor] = useState(false);

  // Preview
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Send test
  const [testEmail, setTestEmail] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { type: 'ok'|'error', text, finalTo?, requestedTo? }

  // Logs
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);

  // Iframe auto-height
  const iframeRef = useRef(null);

  // Init email from session
  useEffect(() => {
    if (user?.email) setTestEmail((e) => e || user.email);
  }, [user?.email]);

  // Cuando cambia template o se carga el negocio → reconstruir mock con datos reales + auto-preview
  // business=null → fallback silencioso a mocks
  useEffect(() => {
    const merged = { ...getMockForTemplate(templateKey), ...buildBusinessOverrides(business) };
    setMockJson(JSON.stringify(merged, null, 2));
    setMockJsonError(null);
    setSendResult(null);

    setPreviewLoading(true);
    setPreviewError(null);
    fetchAdminEmailPreview(templateKey, merged).then((res) => {
      if (res.error) {
        setPreviewError(res.error?.message || 'Error al cargar vista previa');
        setPreviewSubject('');
        setPreviewHtml('');
      } else {
        setPreviewSubject(res.data?.subject || '');
        setPreviewHtml(res.data?.html || '');
      }
      setPreviewLoading(false);
    });
  }, [templateKey, business]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------
  const loadPreview = useCallback(async () => {
    const parsed = parseMockJson(mockJson);
    if (!parsed.ok) {
      setMockJsonError(parsed.error);
      return;
    }
    setMockJsonError(null);
    setPreviewLoading(true);
    setPreviewError(null);
    const res = await fetchAdminEmailPreview(templateKey, parsed.data);
    if (res.error) {
      setPreviewError(res.error?.message || 'Error al cargar vista previa');
      setPreviewSubject('');
      setPreviewHtml('');
    } else {
      setPreviewSubject(res.data?.subject || '');
      setPreviewHtml(res.data?.html || '');
    }
    setPreviewLoading(false);
  }, [templateKey, mockJson]);

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    const res = await getAdminEmailTestLogs(80);
    if (res.error) {
      setLogsError(res.error?.message || 'Error al cargar historial');
      setLogs([]);
    } else {
      setLogs(res.data || []);
    }
    setLogsLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ---------------------------------------------------------------------------
  // Send test
  // ---------------------------------------------------------------------------
  const handleSendTest = async () => {
    const parsed = parseMockJson(mockJson);
    if (!parsed.ok) {
      setMockJsonError(parsed.error);
      return;
    }
    setMockJsonError(null);
    setSendResult(null);
    setSendLoading(true);
    const res = await sendAdminEmailTest(templateKey, testEmail, parsed.data);
    setSendLoading(false);
    if (res.error) {
      const extra = res.error?.raw?.details;
      const detailStr = extra && typeof extra === 'object'
        ? (extra.message || (Array.isArray(extra.errors) ? extra.errors.map((e) => e?.message).filter(Boolean).join(' · ') : ''))
        : '';
      const full = [res.error?.message || 'Error al enviar', detailStr].filter(Boolean).join(' — ');
      setSendResult({ type: 'error', text: full });
    } else {
      const { id, finalTo, requestedTo } = res.data ?? {};
      setSendResult({
        type: 'ok',
        text: id
          ? `Resend aceptó el envío (id: ${id}). Puede tardar 1–2 min. Revisa spam.`
          : 'Envío registrado. Si no ves el correo revisa spam y la config de Resend.',
        finalTo,
        requestedTo,
      });
      loadLogs();
    }
  };

  // ---------------------------------------------------------------------------
  // Iframe resize
  // ---------------------------------------------------------------------------
  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        iframeRef.current.style.height = `${doc.body.scrollHeight + 32}px`;
      }
    } catch { /* cross-origin sandbox */ }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-40 border-b px-4 md:px-6 lg:pl-4 lg:pr-8 py-4 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              aria-label="Volver al panel admin"
            >
              <Icon name="ArrowLeft" size={18} color="var(--color-muted-foreground)" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Centro de plantillas de correo
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Vista previa y envíos de prueba (solo admin)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
            <Icon name="Shield" size={14} color="var(--color-error)" />
            <span className="text-xs font-semibold hidden sm:inline" style={{ fontFamily: 'var(--font-caption)' }}>Admin</span>
          </div>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-8 py-6 space-y-6" style={{ maxWidth: '1200px' }}>

          {/* ── Preview section ── */}
          <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF' }}>
            <h2 className="text-sm font-bold mb-4" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Vista previa
            </h2>

            {/* Template selector + refresh */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                  Plantilla
                </label>
                <select
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  {ADMIN_EMAIL_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={loadPreview}
                disabled={previewLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-opacity disabled:opacity-50 whitespace-nowrap"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="RefreshCw" size={14} color="var(--color-muted-foreground)" />
                Actualizar preview
              </button>
            </div>

            {/* Mock data editor (collapsible) */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowMockEditor((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name={showMockEditor ? 'ChevronDown' : 'ChevronRight'} size={13} color="var(--color-muted-foreground)" />
                {showMockEditor ? 'Ocultar datos mock' : 'Editar datos mock'}
              </button>
              {showMockEditor && (
                <div className="mt-2">
                  <textarea
                    value={mockJson}
                    onChange={(e) => {
                      setMockJson(e.target.value);
                      setMockJsonError(null);
                    }}
                    rows={10}
                    spellCheck={false}
                    className="w-full px-3 py-2 rounded-lg border text-xs font-mono resize-y"
                    style={{
                      borderColor: mockJsonError ? 'var(--color-error)' : 'var(--color-border)',
                      fontFamily: 'var(--font-mono, monospace)',
                      backgroundColor: 'var(--color-muted)',
                      color: 'var(--color-foreground)',
                      lineHeight: 1.6,
                    }}
                    placeholder="{}"
                  />
                  {mockJsonError && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
                      JSON inválido: {mockJsonError}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    Edita los campos para previsualizar datos reales. Se fusionan con los defaults del template.
                  </p>
                </div>
              )}
            </div>

            {/* Preview error */}
            {previewError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
                {previewError}
              </div>
            )}

            {/* Preview iframe */}
            {previewLoading ? (
              <div className="h-64 rounded-lg border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />
            ) : (
              <>
                <p className="text-xs font-semibold mb-2" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                  Asunto: <span style={{ color: 'var(--color-foreground)' }}>{previewSubject || '—'}</span>
                </p>
                <div className="rounded-lg border overflow-hidden bg-white" style={{ borderColor: 'var(--color-border)' }}>
                  <iframe
                    ref={iframeRef}
                    title="Vista previa del email"
                    sandbox=""
                    srcDoc={previewHtml}
                    onLoad={handleIframeLoad}
                    className="w-full border-0 bg-white"
                    style={{ minHeight: '420px' }}
                  />
                </div>
              </>
            )}
          </section>

          {/* ── Send test section ── */}
          <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF' }}>
            <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Enviar prueba
            </h2>

            {/* Info box */}
            <div className="mb-4 p-3 rounded-lg text-xs space-y-1.5" style={{ backgroundColor: 'rgba(124,58,237,0.06)', fontFamily: 'var(--font-caption)', border: '1px solid rgba(124,58,237,0.15)', color: 'var(--color-foreground)' }}>
              <p className="font-semibold">El correo siempre se envía al inbox de prueba configurado</p>
              <ul className="list-disc pl-4 space-y-1" style={{ color: 'var(--color-muted-foreground)' }}>
                <li>El destino real lo define la variable <code className="text-[11px]">EMAIL_TEST_INBOX</code> en la Edge Function (default: <code className="text-[11px]">jotacegaete@gmail.com</code>).</li>
                <li>El campo "Email destino" queda registrado en logs pero no determina el envío.</li>
                <li>Revisa <strong>spam / promociones</strong> si no llega en 2 min.</li>
                <li>Si el estado en historial es <strong>Fallido</strong>, el motivo viene de Resend (dominio, key, permisos).</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold mb-1" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                  Email destino (informativo)
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendLoading || !testEmail?.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 whitespace-nowrap"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="Send" size={15} color="#fff" />
                {sendLoading ? 'Enviando…' : 'Enviar prueba'}
              </button>
            </div>

            {/* Send result */}
            {sendResult && (
              <div
                className="mt-3 px-3 py-2.5 rounded-lg text-xs space-y-1"
                style={{
                  backgroundColor: sendResult.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${sendResult.type === 'ok' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  fontFamily: 'var(--font-caption)',
                  color: sendResult.type === 'ok' ? '#059669' : 'var(--color-error)',
                }}
              >
                <p>{sendResult.text}</p>
                {sendResult.type === 'ok' && sendResult.finalTo && (
                  <p style={{ color: 'var(--color-muted-foreground)' }}>
                    Enviado a: <strong style={{ color: 'var(--color-foreground)' }}>{sendResult.finalTo}</strong>
                    {sendResult.requestedTo && sendResult.requestedTo !== sendResult.finalTo && (
                      <> &nbsp;·&nbsp; solicitado: <span>{sendResult.requestedTo}</span></>
                    )}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── Logs section ── */}
          <section className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Historial de pruebas
              </h2>
              <button
                type="button"
                onClick={loadLogs}
                className="text-xs font-medium px-2 py-1 rounded-lg border"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
              >
                Refrescar
              </button>
            </div>
            {logsError && (
              <div className="px-5 py-2 text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
                {logsError}
              </div>
            )}
            {logsLoading ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Cargando…
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Aún no hay envíos de prueba registrados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" style={{ fontFamily: 'var(--font-caption)' }}>
                  <thead>
                    <tr className="text-xs font-semibold border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5">Plantilla</th>
                      <th className="px-4 py-2.5">Destinatario</th>
                      <th className="px-4 py-2.5 hidden md:table-cell">Asunto</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5 hidden lg:table-cell">Detalle</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--color-foreground)' }}>
                    {logs.map((row) => (
                      <tr key={row.id} className="border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-2.5 text-xs">{templateLabel(row.template_key)}</td>
                        <td className="px-4 py-2.5 text-xs break-all max-w-[180px]">{row.to_email}</td>
                        <td className="px-4 py-2.5 text-xs hidden md:table-cell max-w-xs truncate" title={row.subject}>
                          {row.subject}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: row.status === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                              color: row.status === 'sent' ? '#059669' : '#DC2626',
                            }}
                          >
                            {row.status === 'sent' ? 'Enviado' : 'Fallido'}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 text-xs hidden lg:table-cell max-w-[220px] break-words"
                          style={{ color: 'var(--color-muted-foreground)' }}
                          title={row.error_message || ''}
                        >
                          {row.status === 'failed' && row.error_message ? row.error_message : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
