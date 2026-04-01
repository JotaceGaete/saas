import React, { useMemo, useState } from 'react';
import Icon from 'components/AppIcon';
import { buildWhatsAppUrl } from '../../../utils/buildWhatsAppUrl';
import { VENTALINK_SUPPORT_WHATSAPP_NUMBER } from '../../../config/ventalinkSupportWhatsApp';

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

  const q = query.trim();
  const listToShow = useMemo(() => {
    const base = (rubros || []).filter((r) => r?.id != null);
    if (!q) return sortRubrosAZ(base);
    const nq = normalizeSearch(q);
    return sortRubrosAZ(base.filter((r) => normalizeSearch(r?.name || '').includes(nq)));
  }, [rubros, q]);

  const showEmptySearch = q.length > 0 && listToShow.length === 0;

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
      ) : listToShow.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-[min(320px,50vh)] overflow-y-auto pr-0.5">
          {listToShow.map((r) => (
            <RubroRow key={r.id} rubro={r} selected={selected} onPick={(id) => onChange?.(id)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 font-[family-name:var(--font-caption)]">No hay rubros disponibles.</p>
      )}
    </div>
  );
}
