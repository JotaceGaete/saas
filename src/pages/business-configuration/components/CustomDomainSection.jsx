import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { openWhatsAppUrl } from '../../../utils/openWhatsAppUrl';

const SUPPORT_PHONE = '5492966544879'; // +54 2966 544879
const EDGE_FUNCTION_URL = `${(import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/manage-custom-domain`;

// ─── helpers ─────────────────────────────────────────────────────────────────

function cleanDomain(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\s/g, '');
}

function isValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d);
}

function classifyDomain(domain) {
  const parts = domain.split('.');
  if (parts.length === 2) return 'apex';
  if (parts[0] === 'www') return 'www';
  return 'subdomain';
}

function buildDnsInstructions(domain) {
  const type = classifyDomain(domain);
  if (type === 'apex') {
    return [{ type: 'A', host: '@', value: '76.76.21.21' }];
  }
  const host = domain.split('.')[0];
  return [{ type: 'CNAME', host, value: 'cname.vercel-dns.com' }];
}

async function callEdge(action, domain, businessId) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, domain, business_id: businessId }),
  });
  return res.json();
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active:    { label: 'Activo',       bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    pending:   { label: 'Pendiente',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'  },
    verifying: { label: 'Verificando',  bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500 animate-pulse' },
    error:     { label: 'Error DNS',    bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'    },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function CopyButton({ value, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
      {copied ? 'Copiado' : label}
    </button>
  );
}

function DnsTable({ dns }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Tipo</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Nombre / Host</th>
            <th className="text-left px-3 py-2 font-semibold text-slate-500">Valor / Destino</th>
          </tr>
        </thead>
        <tbody>
          {dns.map((row, i) => (
            <tr key={i}>
              <td className="px-3 py-2.5 font-mono font-bold text-violet-700">{row.type}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-slate-700">{row.host}</code>
                  <CopyButton value={row.host} />
                </div>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-slate-700 break-all">{row.value}</code>
                  <CopyButton value={row.value} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-3 text-left gap-3 text-sm font-medium text-slate-800 hover:text-slate-900 transition-colors"
      >
        <span>{question}</span>
        <svg className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <p className="pb-3 text-sm text-slate-500 leading-relaxed">{answer}</p>}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CustomDomainSection({ business, isStarter = false }) {
  const [domainInput, setDomainInput] = useState('');
  const [savedDomain, setSavedDomain] = useState(null);
  const [status, setStatus] = useState('pending');
  const [dns, setDns] = useState(null);       // [{type, host, value}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Load existing domain row from DB
  useEffect(() => {
    if (!business?.id) return;
    let cancelled = false;
    supabase
      .from('business_domains')
      .select('id, domain, status')
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setSavedDomain(data.domain);
          setDomainInput(data.domain);
          setStatus(data.status || 'pending');
          setDns(buildDnsInstructions(data.domain));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [business?.id]);

  const handleSave = async () => {
    const domain = cleanDomain(domainInput);
    if (!domain) { setError('Ingresa un dominio válido.'); return; }
    if (!isValidDomain(domain)) { setError('Formato inválido. Ej: catalogo.tutienda.com'); return; }
    setError('');
    setVerifyMsg('');
    setSaving(true);

    try {
      const result = await callEdge('add', domain, business.id);
      if (!result.ok) {
        setError(result.error || 'No se pudo agregar el dominio. Intenta de nuevo.');
        setSaving(false);
        return;
      }
      setSavedDomain(domain);
      setStatus('pending');
      setDns(result.dns_instructions || buildDnsInstructions(domain));
    } catch (e) {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = useCallback(async () => {
    if (!savedDomain) return;
    setVerifying(true);
    setVerifyMsg('');
    setError('');
    setStatus('verifying');

    try {
      const result = await callEdge('verify', savedDomain, business.id);
      if (!result.ok) {
        setStatus('error');
        setError(result.error || 'Error al verificar. Intenta de nuevo.');
        return;
      }
      setStatus(result.status);
      if (result.status === 'active') {
        setVerifyMsg('');
      } else {
        setVerifyMsg(
          result.verified === false
            ? 'Los registros DNS aún no se han propagado. Puede demorar hasta 48 h. Vuelve a verificar más tarde.'
            : 'Dominio pendiente de verificación.'
        );
      }
    } catch {
      setStatus('error');
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setVerifying(false);
    }
  }, [savedDomain, business?.id]);

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar el dominio personalizado?')) return;
    await supabase
      .from('business_domains')
      .delete()
      .eq('business_id', business.id);
    setSavedDomain(null);
    setDomainInput('');
    setStatus('pending');
    setDns(null);
    setError('');
    setVerifyMsg('');
  };

  const handleWhatsAppHelp = () => {
    const d = savedDomain || cleanDomain(domainInput) || '(por definir)';
    const msg = `Hola, necesito ayuda para conectar mi dominio a Ventalink.\n\nMi dominio es: ${d}`;
    openWhatsAppUrl(`https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(msg)}`);
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(`https://${savedDomain}`).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) return null;

  // ── Starter gate ─────────────────────────────────────────────────────────
  if (isStarter) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🌐</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-violet-900 font-[family-name:var(--font-caption)]">Dominio personalizado</p>
            <p className="text-xs text-violet-700 mt-0.5">Usa tu propio dominio para tu catálogo. Disponible en planes Pro y Business.</p>
            <a href="/planes" className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors">
              Ver planes
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Active state ─────────────────────────────────────────────────────────
  if (status === 'active' && savedDomain) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎉</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-900 font-[family-name:var(--font-caption)]">Tu dominio está conectado correctamente</p>
              <a href={`https://${savedDomain}`} target="_blank" rel="noopener noreferrer"
                className="mt-1 block text-sm font-semibold text-emerald-700 hover:underline break-all">
                https://{savedDomain}
              </a>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`https://${savedDomain}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Abrir catálogo
                </a>
                <button type="button" onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors">
                  {copiedLink
                    ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  }
                  {copiedLink ? 'Copiado' : 'Copiar enlace'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>¿Quieres cambiar el dominio?</span>
          <button type="button" onClick={handleDelete} className="text-red-500 hover:text-red-700 font-medium transition-colors">
            Eliminar dominio
          </button>
        </div>
      </div>
    );
  }

  // ── Setup / pending / error flow ─────────────────────────────────────────
  const showDnsInstructions = !!savedDomain && dns;
  const dnsType = savedDomain ? classifyDomain(savedDomain) : null;

  return (
    <div className="space-y-5">

      {/* Domain input */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-[family-name:var(--font-caption)]">
          Tu dominio personalizado
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={domainInput}
            onChange={e => { setDomainInput(e.target.value); setError(''); }}
            placeholder="catalogo.tutienda.com"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 transition"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !domainInput.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors font-[family-name:var(--font-caption)] whitespace-nowrap"
          >
            {saving ? 'Guardando…' : savedDomain ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        <p className="mt-1 text-xs text-slate-400">Sin www ni https. Ej: catalogo.tutienda.com</p>
      </div>

      {/* DNS instructions */}
      {showDnsInstructions && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 font-[family-name:var(--font-caption)]">
              Configuración DNS requerida
            </p>
            <StatusBadge status={status} />
          </div>

          {/* Domain-type hint */}
          <p className="text-xs text-slate-500">
            {dnsType === 'apex'
              ? 'Tu dominio es un dominio raíz (apex). Crea el siguiente registro A en tu proveedor:'
              : dnsType === 'www'
              ? 'Tu dominio usa www. Crea el siguiente registro CNAME en tu proveedor:'
              : 'Tu dominio es un subdominio. Crea el siguiente registro CNAME en tu proveedor:'}
          </p>

          <DnsTable dns={dns} />

          {verifyMsg && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              ⏳ {verifyMsg}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 transition-colors font-[family-name:var(--font-caption)]"
            >
              {verifying ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" /><path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
                  Verificando…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Verificar dominio
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Help card */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 space-y-3">
        <p className="text-sm font-bold text-blue-900 font-[family-name:var(--font-caption)]">
          🚀 ¿Necesitas ayuda para conectar tu dominio?
        </p>
        <p className="text-xs text-blue-800 leading-relaxed">
          No te preocupes si nunca has configurado un dominio o registros DNS.
          Podemos ayudarte paso a paso durante el proceso o acompañarte en la configuración
          para que tu catálogo quede funcionando correctamente con tu dominio personalizado.
        </p>
        <button
          type="button"
          onClick={handleWhatsAppHelp}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1ebe5d] transition-colors shadow-sm font-[family-name:var(--font-caption)]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
          Solicitar ayuda por WhatsApp
        </button>
      </div>

      {/* Educational block */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800 font-[family-name:var(--font-caption)]">
          ¿Qué necesito para usar mi dominio?
        </p>
        <ul className="space-y-1.5">
          {[
            'Tener un dominio propio',
            'Acceso al panel donde administras tu dominio',
            'Crear un registro DNS (te indicamos exactamente cuál)',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
              <svg className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
          <span className="text-base">⏱️</span>
          <span>Tiempo estimado: <strong className="text-slate-700">entre 5 y 15 minutos</strong></span>
        </div>
      </div>

      {/* FAQ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-800 mb-3 font-[family-name:var(--font-caption)]">Preguntas frecuentes</p>
        <FaqItem
          question="¿Y si no sé quién administra mi dominio?"
          answer="No hay problema. Nuestro equipo puede ayudarte a identificar dónde está registrado y cómo acceder."
        />
        <FaqItem
          question="¿Puedo seguir usando Ventalink normalmente?"
          answer="Sí. Tu panel de administración seguirá funcionando en Ventalink. El dominio personalizado solo se utiliza para que tus clientes vean tu catálogo con tu propia marca."
        />
        <FaqItem
          question="¿Puedo quitar el dominio después?"
          answer="Sí. Puedes eliminar o cambiar tu dominio cuando quieras desde esta misma sección."
        />
      </div>

    </div>
  );
}
