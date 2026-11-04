import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useIsDesktop } from 'hooks/useMediaQuery';
import {
  REVIEW_STATUS_LABELS,
  describeAdminFiscalError,
  listFiscalApplications,
  reviewFiscalApplication,
} from 'services/adminFiscalApplicationsService';

// Panel de Walinka → Altas de facturación electrónica. Cada comercio envía RUT, API key de
// DTE Core y resolución SII; aquí un admin las revisa. Aprobar habilita la emisión de ese
// comercio; rechazar y suspender la apagan y muestran el motivo al comercio.

const FILTERS = [
  { key: 'pending_review', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'suspended', label: 'Suspendidas' },
  { key: null, label: 'Todas' },
];

const CHECKLIST = [
  'El RUT corresponde al comercio (razón social en el SII).',
  'La cuenta DTE Core está a nombre de ese RUT y activa.',
  'La resolución SII (número y fecha) coincide con la autorización del SII.',
];

const TONES = {
  pending_review: 'bg-sky-100 text-sky-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-amber-100 text-amber-800',
  draft: 'bg-slate-100 text-slate-700',
};

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-CL', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

function ApplicationCard({ app, onReviewed }) {
  const [mode, setMode] = useState(null); // null | 'approve' | 'reject' | 'suspend'
  const [checks, setChecks] = useState(() => CHECKLIST.map(() => false));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setMode(null); setChecks(CHECKLIST.map(() => false)); setNote(''); setError(''); };
  const canConfirm = mode === 'approve' ? checks.every(Boolean) && app.hasCredentials : note.trim().length > 0;

  const confirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    setError('');
    const r = await reviewFiscalApplication(app.businessId, mode, note.trim());
    setBusy(false);
    if (r.error) { setError(describeAdminFiscalError(r.error)); return; }
    reset();
    onReviewed(r.applications);
  };

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: 'var(--color-border)' }} data-testid={`application-${app.businessId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>{app.businessName}</h2>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{app.ownerEmail || 'sin correo'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[app.reviewStatus] || TONES.draft}`}>
          {REVIEW_STATUS_LABELS[app.reviewStatus] || app.reviewStatus}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <div><dt className="inline text-slate-500">RUT: </dt><dd className="inline font-semibold">{app.issuerRut}</dd></div>
        <div><dt className="inline text-slate-500">API key: </dt><dd className="inline font-semibold">{app.hasCredentials ? 'guardada' : 'falta'}</dd></div>
        <div><dt className="inline text-slate-500">Resolución SII: </dt><dd className="inline font-semibold">{app.resolucionNumero ? `N° ${app.resolucionNumero} del ${formatDate(app.resolucionFecha)}` : 'falta'}</dd></div>
        <div><dt className="inline text-slate-500">Sucursal: </dt><dd className="inline font-semibold">{app.sucursalNombre || app.sucursalCodigo ? `${app.sucursalNombre || '—'}${app.sucursalCodigo ? ` (${app.sucursalCodigo})` : ''}` : 'no indicada'}</dd></div>
        <div><dt className="inline text-slate-500">Enviada: </dt><dd className="inline">{formatDate(app.submittedAt, true)}</dd></div>
        {app.reviewedAt && <div><dt className="inline text-slate-500">Revisada: </dt><dd className="inline">{formatDate(app.reviewedAt, true)}</dd></div>}
      </dl>
      {app.reviewNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">Nota: {app.reviewNote}</p>}

      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {!mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          {app.reviewStatus === 'pending_review' && (
            <>
              <button type="button" onClick={() => setMode('approve')} className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">Aprobar</button>
              <button type="button" onClick={() => setMode('reject')} className="min-h-[44px] rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50">Rechazar</button>
            </>
          )}
          {app.reviewStatus === 'approved' && (
            <button type="button" onClick={() => setMode('suspend')} className="min-h-[44px] rounded-lg border border-amber-300 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50">Suspender emisión</button>
          )}
        </div>
      )}

      {mode === 'approve' && (
        <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">Antes de aprobar, verifica:</p>
          {CHECKLIST.map((item, i) => (
            <label key={item} className="flex items-start gap-2 text-xs text-emerald-900">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checks[i]}
                onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} />
              {item}
            </label>
          ))}
          {!app.hasCredentials && <p className="text-xs font-semibold text-red-600">Falta la API key: no se puede aprobar.</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={confirm} disabled={!canConfirm || busy} className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Aprobando…' : 'Confirmar aprobación'}
            </button>
            <button type="button" onClick={reset} className="min-h-[44px] px-3 text-sm text-slate-600">Cancelar</button>
          </div>
          <p className="text-[11px] text-emerald-800">Al aprobar, este comercio podrá emitir boletas reales con su cuenta DTE Core.</p>
        </div>
      )}

      {(mode === 'reject' || mode === 'suspend') && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <label htmlFor={`note-${app.businessId}`} className="block text-xs font-semibold text-red-900">
            Motivo ({mode === 'reject' ? 'el comercio lo verá para corregir' : 'el comercio lo verá'})
          </label>
          <textarea id={`note-${app.businessId}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-red-200 bg-white p-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={confirm} disabled={!canConfirm || busy} className="min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Guardando…' : mode === 'reject' ? 'Confirmar rechazo' : 'Confirmar suspensión'}
            </button>
            <button type="button" onClick={reset} className="min-h-[44px] px-3 text-sm text-slate-600">Cancelar</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function AdminFiscalApplicationsPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const [filter, setFilter] = useState('pending_review');
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const r = await listFiscalApplications(filter);
    setLoading(false);
    if (r.error) { setError(describeAdminFiscalError(r.error)); setApps([]); return; }
    setApps(r.applications);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const onReviewed = (all) => setApps(filter ? all.filter((a) => a.reviewStatus === filter) : all);

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}>
        <div className="sticky top-0 z-40 border-b px-4 md:px-6 lg:pl-4 lg:pr-8 py-4 flex items-center justify-between gap-3"
          style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/admin')} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Volver al panel admin">
              <Icon name="ArrowLeft" size={18} color="var(--color-muted-foreground)" />
            </button>
            <div>
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Altas de facturación</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>Revisa las cuentas DTE Core de los comercios antes de habilitar sus boletas</p>
            </div>
          </div>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: 'var(--color-border)' }}>
            <Icon name="RefreshCw" size={14} /> Actualizar
          </button>
        </div>

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-8 py-6 space-y-4" style={{ maxWidth: '960px' }}>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar solicitudes">
            {FILTERS.map((f) => (
              <button key={String(f.key)} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={`min-h-[40px] rounded-full px-4 text-xs font-semibold ${filter === f.key ? 'bg-slate-900 text-white' : 'border bg-white text-slate-700'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {loading && <p className="text-sm text-slate-500">Cargando…</p>}
          {!loading && !error && apps.length === 0 && (
            <p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-slate-500">No hay solicitudes en esta lista.</p>
          )}
          {apps.map((app) => <ApplicationCard key={app.businessId} app={app} onReviewed={onReviewed} />)}
        </div>
      </main>
    </div>
  );
}
