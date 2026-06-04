import React, { useState, useEffect, useCallback } from 'react';
import Icon from 'components/AppIcon';
import { useAuth } from '../../../contexts/AuthContext';
import { getEffectivePlanSlug } from '../../../services/waBusinessService';
import {
  getBusinessDomain,
  saveBusinessDomain,
  deleteBusinessDomain,
  verifyBusinessDomain,
  getDnsInstructions,
} from '../../../services/customDomainService';

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-400',
    icon: 'Clock',
    description: 'Dominio registrado. Configura los registros DNS y luego verifica.',
  },
  verifying: {
    label: 'Verificando',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: 'Loader2',
    description: 'Verificando la propagación DNS. Puede tardar hasta 48 horas.',
  },
  active: {
    label: 'Activo',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: 'CheckCircle2',
    description: 'Tu dominio está activo y apuntando al catálogo correctamente.',
  },
  error: {
    label: 'Error de configuración',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
    icon: 'AlertCircle',
    description: 'Revisa los registros DNS de tu dominio e intenta verificar nuevamente.',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const isVerifying = status === 'verifying';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${isVerifying ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function DnsInstructions({ domain }) {
  const instructions = getDnsInstructions(domain);
  const [copied, setCopied] = useState(null);

  const copy = (value) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(value);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <Icon name="Terminal" size={14} color="#1d4ed8" />
        <p className="text-sm font-bold text-blue-800">Configura los registros DNS</p>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-blue-700 leading-snug">
          Agrega estos registros en el panel de tu registrador de dominio (ej: GoDaddy, Namecheap, Cloudflare).
          La propagación puede tardar entre 1 y 48 horas.
        </p>
        {instructions.map((ins, i) => (
          <div key={i} className="rounded-lg border border-blue-200 overflow-hidden">
            <div className="bg-blue-100/60 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">{ins.description}</span>
            </div>
            <div className="divide-y divide-blue-100">
              <div className="grid grid-cols-3 px-3 py-2 text-xs">
                <span className="text-blue-500 font-semibold">Tipo</span>
                <span className="text-blue-500 font-semibold">Nombre</span>
                <span className="text-blue-500 font-semibold">Valor</span>
              </div>
              <div className="grid grid-cols-3 px-3 py-2 gap-2 items-center">
                <span className="text-xs font-bold text-blue-900 font-mono">{ins.type}</span>
                <span className="text-xs font-mono text-gray-700 break-all">{ins.name}</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono text-gray-700 break-all flex-1">{ins.value}</span>
                  <button
                    onClick={() => copy(ins.value)}
                    className="shrink-0 p-1 rounded hover:bg-blue-100 transition-colors"
                    title="Copiar"
                  >
                    <Icon name={copied === ins.value ? 'Check' : 'Copy'} size={12} color={copied === ins.value ? '#059669' : '#3b82f6'} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-blue-600 opacity-70">
          TTL recomendado: 300 segundos (5 minutos). Una vez configurado, haz clic en &quot;Verificar dominio&quot;.
        </p>
      </div>
    </div>
  );
}

// ─── Bloque premium para planes Starter ──────────────────────────────────────

function PremiumBlock() {
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
        <Icon name="Globe" size={20} color="#7c3aed" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-gray-900">Dominio propio</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Pro / Full</span>
        </div>
        <p className="text-sm text-gray-500 leading-snug">
          Muestra tu catálogo en <strong className="text-gray-700">www.tutienda.cl</strong> en vez de ventalink.app/tutienda.
          Más profesional, mejor posicionamiento.
        </p>
        <a
          href="/planes"
          className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
        >
          <Icon name="ArrowRight" size={12} />
          Ver planes
        </a>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CustomDomainSettings() {
  const { business } = useAuth();

  const effectivePlan = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt,
  );
  const hasAccess = ['pro', 'business'].includes(effectivePlan);

  const [record, setRecord]     = useState(null); // registro en business_domains
  const [loading, setLoading]   = useState(true);
  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const load = useCallback(async () => {
    if (!business?.id || !hasAccess) { setLoading(false); return; }
    setLoading(true);
    const { data } = await getBusinessDomain();
    setRecord(data?.domain ? data : null);
    setLoading(false);
  }, [business?.id, hasAccess]);

  useEffect(() => { load(); }, [load]);

  // ── Guardar dominio ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(''); setSuccess('');
    const raw = inputVal.trim();
    if (!raw) { setError('Ingresa un dominio.'); return; }
    setSaving(true);
    const { data, error: err } = await saveBusinessDomain(raw);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setRecord(data?.record ?? { domain: raw, status: 'pending' });
    setInputVal('');
    setSuccess('Dominio registrado. Configura los registros DNS y luego verifica.');
  };

  // ── Verificar estado ─────────────────────────────────────────────────────────
  const handleVerify = async () => {
    setError(''); setSuccess('');
    setVerifying(true);
    const { data, error: err } = await verifyBusinessDomain();
    setVerifying(false);
    if (err) { setError(err.message); return; }
    if (data?.domain) {
      setRecord(data);
      if (data.status === 'active') setSuccess('¡Dominio verificado y activo!');
      else setSuccess('Verificación actualizada. Revisa el estado abajo.');
    }
  };

  // ── Eliminar dominio ─────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!window.confirm(`¿Eliminar el dominio "${record?.domain}"? El catálogo volverá a estar solo en ventalink.app.`)) return;
    setError(''); setSuccess('');
    setRemoving(true);
    const { error: err } = await deleteBusinessDomain();
    setRemoving(false);
    if (err) { setError(err.message); return; }
    setRecord(null);
    setSuccess('Dominio eliminado correctamente.');
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!hasAccess) return <PremiumBlock />;

  return (
    <div className="space-y-4">

      {/* Estado actual */}
      {loading ? (
        <div className="py-6 flex justify-center">
          <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : record ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <Icon name="Globe" size={17} color="#7c3aed" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{record.domain}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Registrado {record.created_at ? new Date(record.created_at).toLocaleDateString('es-CL') : ''}
                </p>
              </div>
            </div>
            <StatusBadge status={record.status} />
          </div>

          {/* Descripción del estado */}
          <div className="px-4 py-3 flex items-start gap-2 border-b border-gray-50">
            <Icon
              name={(STATUS_CONFIG[record.status] || STATUS_CONFIG.pending).icon}
              size={14}
              color={record.status === 'active' ? '#059669' : record.status === 'error' ? '#dc2626' : '#6b7280'}
              className={record.status === 'verifying' ? 'animate-spin' : ''}
            />
            <p className="text-xs text-gray-600 leading-snug">
              {(STATUS_CONFIG[record.status] || STATUS_CONFIG.pending).description}
            </p>
          </div>

          {/* Acciones */}
          <div className="px-4 py-3 flex flex-wrap gap-2">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {verifying
                ? <><div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />Verificando…</>
                : <><Icon name="RefreshCw" size={13} />Verificar dominio</>
              }
            </button>
            {record.status === 'active' && (
              <a
                href={`https://${record.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors"
              >
                <Icon name="ExternalLink" size={13} />
                Abrir sitio
              </a>
            )}
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-60 ml-auto"
            >
              {removing
                ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                : <Icon name="Trash2" size={13} />
              }
              Quitar dominio
            </button>
          </div>
        </div>
      ) : (
        /* Formulario para agregar dominio */
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Dominio propio
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="www.mitienda.cl"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                onClick={handleSave}
                disabled={saving || !inputVal.trim()}
                className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  : <Icon name="Plus" size={15} />
                }
                {saving ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Solo el dominio, sin https:// ni rutas. Ej: <span className="font-mono">www.mitienda.cl</span>
            </p>
          </div>
        </div>
      )}

      {/* Mensajes de feedback */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <Icon name="AlertCircle" size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <Icon name="CheckCircle2" size={15} className="shrink-0 mt-0.5" />
          {success}
        </div>
      )}

      {/* Instrucciones DNS — siempre visibles cuando hay dominio no activo */}
      {record && record.status !== 'active' && (
        <DnsInstructions domain={record.domain} />
      )}

      {/* Info URL del catálogo actual */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center gap-3">
        <Icon name="Link" size={14} color="#6b7280" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-600">URL actual del catálogo</p>
          <p className="text-xs font-mono text-gray-400 truncate">
            {`${window.location.origin}/catalogo/${business?.slug || ''}`}
          </p>
        </div>
        <a
          href={`/catalogo/${business?.slug || ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <Icon name="ExternalLink" size={13} color="#9ca3af" />
        </a>
      </div>

    </div>
  );
}
