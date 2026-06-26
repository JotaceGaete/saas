/**
 * Design system compartido para listados de documentos comerciales CRM.
 * Usado por CrmQuotes.jsx, CrmInvoices.jsx y futuros módulos similares.
 * Solo componentes visuales — sin lógica de negocio.
 */
import React, { useEffect, useRef, useState } from 'react';
import Icon from 'components/AppIcon';

// ─── KPI card ─────────────────────────────────────────────────────────────────

export function KpiCard({ icon, label, value, sub, color = 'blue', onClick, active }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-500',    val: 'text-blue-700',    ring: 'ring-blue-200' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-500', val: 'text-emerald-700', ring: 'ring-emerald-200' },
    amber:  { bg: 'bg-amber-50',   icon: 'text-amber-500',   val: 'text-amber-700',   ring: 'ring-amber-200' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-500',     val: 'text-red-700',     ring: 'ring-red-200' },
    gray:   { bg: 'bg-gray-50',    icon: 'text-gray-400',    val: 'text-gray-700',    ring: 'ring-gray-200' },
  };
  const c = colors[color] || colors.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
        active
          ? `${c.bg} ring-2 ${c.ring} border-transparent shadow-sm`
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? c.bg : 'bg-gray-50'}`}>
        <Icon name={icon} size={16} className={active ? c.icon : 'text-gray-400'} />
      </div>
      <div>
        <p className={`text-lg font-black leading-none tracking-tight ${active ? c.val : 'text-gray-900'}`}>{value}</p>
        <p className="mt-0.5 text-xs font-medium text-gray-400">{label}</p>
        {sub && <p className={`mt-0.5 text-[10px] font-semibold ${active ? c.icon : 'text-gray-300'}`}>{sub}</p>}
      </div>
    </button>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

export function FilterChip({ label, count, active, onClick, dot, colorActive = 'bg-gray-900 text-white' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? `${colorActive} shadow-sm`
          : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300'
      }`}
    >
      {dot && !active && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

export function DocSearchBar({ value, onChange, placeholder = 'Buscar…' }) {
  return (
    <div className="relative w-full sm:w-72">
      <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <Icon name="X" size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

export function DocStatusBadge({ label, dot, badge }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

export function DocActionMenu({ items, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Más acciones"
      >
        <Icon name="MoreHorizontal" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl shadow-gray-200/80">
          {items.map((item, i) => {
            if (item.type === 'divider') return <div key={i} className="my-1 border-t border-gray-100" />;
            return (
              <button
                key={i}
                type="button"
                onClick={item.disabled || item.soon ? undefined : (e) => { e.stopPropagation(); setOpen(false); item.onClick?.(); }}
                disabled={item.disabled}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-medium disabled:opacity-40 ${
                  item.red    ? 'text-red-600 hover:bg-red-50' :
                  item.green  ? 'text-emerald-700 hover:bg-emerald-50' :
                  item.soon   ? 'cursor-default text-gray-300' :
                                'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon name={item.icon} size={13} />
                {item.label}
                {item.soon && (
                  <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">PRONTO</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

export function DocEmptyState({ icon, title, description, action, actionLabel, actionIcon = 'PlusCircle' }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
        <Icon name={icon} size={28} className="text-blue-400" />
      </div>
      <h3 className="text-base font-bold text-gray-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      {action && (
        <button
          onClick={action}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
        >
          <Icon name={actionIcon} size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function DocNoResults({ search, onClear }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        <Icon name="SearchX" size={22} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
      <p className="mt-1 text-xs text-gray-400">
        {search ? `No hay documentos para "${search}".` : 'No hay documentos con este filtro.'}
      </p>
      <button onClick={onClear} className="mt-3 text-sm font-medium text-blue-600 hover:underline">
        Limpiar filtros
      </button>
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────

export function DocListHeader({ title, count, noun, ctaLabel, ctaIcon = 'PlusCircle', onCta, loading }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-gray-900">{title}</h1>
        <p className="mt-0.5 text-sm text-gray-400">
          {loading ? 'Cargando…' : `${count} ${noun}`}
        </p>
      </div>
      <button
        onClick={onCta}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
      >
        <Icon name={ctaIcon} size={16} />
        {ctaLabel}
      </button>
    </div>
  );
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────

export function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(`${dateStr}T12:00:00`); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

export function ExpiryPill({ days }) {
  if (days === null) return null;
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
        <Icon name="AlertCircle" size={10} />
        Venció hace {Math.abs(days)}d
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
        <Icon name="AlertCircle" size={10} />
        Vence hoy
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
        <Icon name="Clock" size={10} />
        Vence en {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-400">
      <Icon name="Clock" size={10} />
      Vence en {days}d
    </span>
  );
}
