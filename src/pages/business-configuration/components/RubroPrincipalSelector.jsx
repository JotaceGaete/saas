import React, { useMemo, useState } from 'react';
import Icon from 'components/AppIcon';
import { buildWhatsAppUrl } from '../../../utils/buildWhatsAppUrl';
import { VENTALINK_SUPPORT_WHATSAPP_NUMBER } from '../../../config/ventalinkSupportWhatsApp';

/** Orden fijo de rubros populares; solo se muestran si existen en `rubros` con el mismo `name`. */
const POPULAR_NAMES = [
  'Gastronomía',
  'Verdulería',
  'Ropa',
  'Repuestos automotrices',
  'Belleza y Cuidado Personal',
];

function normalizeSearch(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sortRubrosAZ(list) {
  return [...list].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' }),
  );
}

const inputClass = [
  'w-full px-3 py-2.5 pl-9 rounded-xl border border-slate-200 bg-white text-sm text-slate-900',
  'outline-none transition-all font-[family-name:var(--font-caption)]',
  'focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500',
].join(' ');

const inputStyle = { fontFamily: 'var(--font-caption)' };

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 font-[family-name:var(--font-caption)] mb-2 mt-3 first:mt-0">
      {children}
    </p>
  );
}

function RubroRow({ rubro, selected, onPick }) {
  const id = rubro?.id != null ? String(rubro.id) : '';
  const isSel = selected === id;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={[
        'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all font-[family-name:var(--font-caption)]',
        isSel
          ? 'border-violet-500 bg-violet-50 text-slate-900 shadow-sm ring-1 ring-violet-500/20'
          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300',
      ].join(' ')}
    >
      {rubro?.name || '—'}
    </button>
  );
}

/**
 * Selector visual de rubro; persiste el mismo valor que el `<select>` anterior (`rubro.id`).
 */
export default function RubroPrincipalSelector({ rubros = [], value, onChange }) {
  const [query, setQuery] = useState('');
  const selected = value != null ? String(value) : '';

  const byName = useMemo(() => {
    const m = new Map();
    (rubros || []).forEach((r) => {
      if (r?.name && !m.has(r.name)) m.set(r.name, r);
    });
    return m;
  }, [rubros]);

  const popularFromSource = useMemo(() => {
    return POPULAR_NAMES.map((name) => byName.get(name)).filter(Boolean);
  }, [byName]);

  const popularIds = useMemo(() => new Set(popularFromSource.map((r) => String(r.id))), [popularFromSource]);

  const allNonPopularAZ = useMemo(() => {
    return sortRubrosAZ((rubros || []).filter((r) => r?.id != null && !popularIds.has(String(r.id))));
  }, [rubros, popularIds]);

  const q = query.trim();
  const filtered = useMemo(() => {
    if (!q) return null;
    const nq = normalizeSearch(q);
    return (rubros || []).filter((r) => normalizeSearch(r?.name || '').includes(nq));
  }, [rubros, q]);

  const { popularShow, restShow } = useMemo(() => {
    if (filtered === null) {
      return { popularShow: popularFromSource, restShow: allNonPopularAZ };
    }
    const fid = new Set(filtered.map((r) => String(r.id)));
    const pop = POPULAR_NAMES.map((name) => byName.get(name))
      .filter((r) => r && fid.has(String(r.id)));
    const popId = new Set(pop.map((r) => String(r.id)));
    const rest = sortRubrosAZ(filtered.filter((r) => !popId.has(String(r.id))));
    return { popularShow: pop, restShow: rest };
  }, [filtered, popularFromSource, allNonPopularAZ, byName]);

  const showEmptySearch = q.length > 0 && filtered && filtered.length === 0;

  const waRubroHelpUrl = buildWhatsAppUrl(
    'Hola, necesito solicitar un rubro que no aparece en la lista de Ventalink.',
    VENTALINK_SUPPORT_WHATSAPP_NUMBER,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <Icon name="Search" size={16} color="currentColor" />
        </span>
        <input
          type="search"
          autoComplete="off"
          placeholder="Buscar rubro..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
          style={inputStyle}
          aria-label="Buscar rubro"
        />
      </div>

      <button
        type="button"
        onClick={() => onChange?.('')}
        className={[
          'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all font-[family-name:var(--font-caption)]',
          selected === ''
            ? 'border-violet-500 bg-violet-50 text-slate-900 shadow-sm ring-1 ring-violet-500/20'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        ].join(' ')}
      >
        Sin rubro
      </button>

      {showEmptySearch ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-600 font-[family-name:var(--font-caption)]">
          <p>No encontramos ese rubro. Si necesitas uno específico, solicítalo por WhatsApp.</p>
          {waRubroHelpUrl !== '#' && (
            <button
              type="button"
              onClick={() => window.open(waRubroHelpUrl, '_blank')}
              className="mt-2 text-sm font-medium text-violet-700 hover:text-violet-800"
            >
              Abrir WhatsApp
            </button>
          )}
        </div>
      ) : (
        <>
          {popularShow.length > 0 && (
            <div>
              <SectionLabel>Rubros populares</SectionLabel>
              <div className="flex flex-col gap-2">
                {popularShow.map((r) => (
                  <RubroRow key={r.id} rubro={r} selected={selected} onPick={(id) => onChange?.(id)} />
                ))}
              </div>
            </div>
          )}

          {restShow.length > 0 && (
            <div>
              <SectionLabel>Todos los rubros</SectionLabel>
              <div className="flex flex-col gap-2 max-h-[min(320px,50vh)] overflow-y-auto pr-0.5">
                {restShow.map((r) => (
                  <RubroRow key={r.id} rubro={r} selected={selected} onPick={(id) => onChange?.(id)} />
                ))}
              </div>
            </div>
          )}

          {!popularShow.length && !restShow.length && (
            <p className="text-sm text-slate-500 font-[family-name:var(--font-caption)]">No hay rubros disponibles.</p>
          )}
        </>
      )}
    </div>
  );
}
