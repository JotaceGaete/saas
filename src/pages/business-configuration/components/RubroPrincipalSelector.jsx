import React, { useMemo, useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import { buildWhatsAppUrl } from '../../../utils/whatsapp';
import { SUPPORT_WHATSAPP_NUMBER } from '../../../config/support';

const MAX_RESULTS = 7;

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

/**
 * Selector de rubro tipo buscador.
 * - Sin rubro seleccionado: muestra input de búsqueda.
 * - Con rubro seleccionado: muestra badge con opción de quitar.
 */
export default function RubroPrincipalSelector({ rubros = [], value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const selected = value != null ? String(value) : '';
  const selectedRubro = useMemo(
    () => (rubros || []).find((r) => String(r?.id) === selected) ?? null,
    [rubros, selected],
  );

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const base = (rubros || []).filter((r) => r?.id != null);
    const nq = normalizeSearch(q);
    return sortRubrosAZ(base.filter((r) => normalizeSearch(r?.name || '').includes(nq))).slice(
      0,
      MAX_RESULTS,
    );
  }, [rubros, query]);

  const showSuggestions = open && query.trim().length > 0;
  const noResults = showSuggestions && suggestions.length === 0;

  const waRubroHelpUrl = buildWhatsAppUrl(
    'Hola, necesito solicitar un rubro que no aparece en la lista de Ventalink.',
    SUPPORT_WHATSAPP_NUMBER,
  );

  function handleSelect(id) {
    setQuery('');
    setOpen(false);
    onChange?.(id);
  }

  function handleClear() {
    setQuery('');
    setOpen(false);
    onChange?.('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // — Estado: rubro seleccionado → mostrar badge
  if (selectedRubro) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-sm font-medium text-violet-800 font-[family-name:var(--font-caption)]">
            {selectedRubro.name}
            <button
              type="button"
              onClick={handleClear}
              aria-label="Quitar rubro"
              className="ml-0.5 -mr-0.5 rounded-full p-0.5 hover:bg-violet-200 transition-colors text-violet-500 hover:text-violet-700"
            >
              <Icon name="X" size={12} color="currentColor" />
            </button>
          </span>
        </div>
        <p className="text-xs text-slate-400 font-[family-name:var(--font-caption)]">
          Haz clic en ✕ para cambiar de rubro.
        </p>
      </div>
    );
  }

  // — Estado: sin selección → mostrar buscador
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-slate-400 font-[family-name:var(--font-caption)]">
        Selecciona el rubro de tu negocio
      </p>

      <div className="relative">
        {/* Input buscador */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <Icon name="Search" size={15} color="currentColor" />
          </span>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            placeholder="Buscar rubro..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="w-full px-3 py-2.5 pl-9 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 outline-none transition-all font-[family-name:var(--font-caption)] focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500"
            style={{ fontFamily: 'var(--font-caption)' }}
            aria-label="Buscar rubro"
          />
        </div>

        {/* Dropdown de sugerencias */}
        {showSuggestions && !noResults && (
          <ul className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            {suggestions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(String(r.id))}
                  className="w-full text-left px-3 py-2.5 text-sm text-slate-800 hover:bg-violet-50 hover:text-violet-900 transition-colors font-[family-name:var(--font-caption)]"
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Sin resultados */}
        {noResults && (
          <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-3">
            <p className="text-sm text-slate-500 font-[family-name:var(--font-caption)]">
              No encontramos ese rubro.
            </p>
            {waRubroHelpUrl !== '#' && (
              <button
                type="button"
                onClick={() => window.open(waRubroHelpUrl, '_blank')}
                className="mt-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 font-[family-name:var(--font-caption)]"
              >
                Solicitar por WhatsApp
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
