import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import { buildWhatsAppUrl } from '../../../utils/whatsapp';
import { SUPPORT_WHATSAPP_NUMBER } from '../../../config/support';

// ── helpers ──────────────────────────────────────────────────────────────────

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const FONT = 'font-[family-name:var(--font-caption)]';

// Nombres de rubros que se muestran como sugeridos (en orden de prioridad)
const SUGGESTED_NAMES = ['Comida', 'Belleza', 'Ropa', 'Artesanías', 'Tecnología', 'Mascotas'];

// ── sub-components ───────────────────────────────────────────────────────────

function SelectedChip({ name, onRemove }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-violet-100 text-violet-800 border border-violet-200 ${FONT}`}
    >
      {name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${name}`}
        className="ml-0.5 -mr-0.5 flex items-center justify-center w-4 h-4 rounded-full hover:bg-violet-200 transition-colors"
      >
        <Icon name="X" size={12} color="currentColor" />
      </button>
    </span>
  );
}

function SuggestedChip({ name, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border border-slate-200 bg-white text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors ${FONT}`}
    >
      {name}
    </button>
  );
}

function DropdownItem({ name, active, onClick, onMouseEnter }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={[
        `w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${FONT}`,
        active ? 'bg-violet-50 text-violet-800' : 'text-slate-800 hover:bg-slate-50',
      ].join(' ')}
    >
      {name}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function RubroPrincipalSelector({ rubros = [], value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const selected = value != null ? String(value) : '';
  const selectedRubro = useMemo(
    () => rubros.find((r) => String(r?.id) === selected) ?? null,
    [rubros, selected],
  );

  // Suggested rubros resolved from the actual list
  const suggestedRubros = useMemo(() => {
    const result = [];
    for (const name of SUGGESTED_NAMES) {
      const match = rubros.find((r) => normalize(r?.name) === normalize(name));
      if (match && String(match.id) !== selected) result.push(match);
      if (result.length >= 6) break;
    }
    return result;
  }, [rubros, selected]);

  // Filtered dropdown list
  const filteredRubros = useMemo(() => {
    const q = normalize(query.trim());
    const base = rubros.filter((r) => r?.id != null);
    if (!q) {
      return [...base].sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' }),
      );
    }
    return [...base]
      .filter((r) => normalize(r?.name || '').includes(q))
      .sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' }),
      );
  }, [rubros, query]);

  const openDropdown = useCallback(() => {
    setOpen(true);
    setActiveIdx(-1);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIdx(-1);
  }, []);

  const pickRubro = useCallback(
    (id) => {
      onChange?.(id);
      setQuery('');
      closeDropdown();
    },
    [onChange, closeDropdown],
  );

  const clearSelection = useCallback(() => {
    onChange?.('');
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [closeDropdown]);

  // Keyboard navigation
  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filteredRubros.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && filteredRubros[activeIdx]) {
        pickRubro(String(filteredRubros[activeIdx].id));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  const waRubroHelpUrl = buildWhatsAppUrl(
    'Hola, necesito solicitar un rubro que no aparece en la lista de Ventalink.',
    SUPPORT_WHATSAPP_NUMBER,
  );

  const noResults = open && query.trim().length > 0 && filteredRubros.length === 0;

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* ── Selected chip ── */}
      {selectedRubro && (
        <div className="flex flex-wrap gap-2">
          <SelectedChip name={selectedRubro.name} onRemove={clearSelection} />
        </div>
      )}

      {/* ── Suggestions ── */}
      {!selectedRubro && suggestedRubros.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={`text-xs text-slate-400 ${FONT}`}>Sugeridos</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestedRubros.map((r) => (
              <SuggestedChip key={r.id} name={r.name} onClick={() => pickRubro(String(r.id))} />
            ))}
          </div>
        </div>
      )}

      {/* ── Search input + dropdown ── */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 z-10">
          <Icon name="Search" size={15} color="currentColor" />
        </span>
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          autoFocus
          placeholder={selectedRubro ? `Cambiar rubro...` : 'Buscar rubro...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            openDropdown();
          }}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
          aria-label="Buscar rubro"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          className={[
            'w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900',
            `outline-none transition-all ${FONT}`,
            open
              ? 'ring-4 ring-violet-500/10 border-violet-400'
              : 'focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500',
          ].join(' ')}
        />

        {/* Dropdown */}
        {open && (
          <div
            role="listbox"
            className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
          >
            {/* "Sin rubro" option */}
            <div className="p-1 border-b border-slate-100">
              <DropdownItem
                name="Sin rubro"
                active={activeIdx === -2}
                onClick={() => pickRubro('')}
                onMouseEnter={() => setActiveIdx(-2)}
              />
            </div>

            {/* Results */}
            <div className="max-h-[min(240px,45vh)] overflow-y-auto p-1">
              {noResults ? (
                <div className={`px-3 py-3 text-sm text-slate-500 ${FONT}`}>
                  <p>No encontramos ese rubro.</p>
                  {waRubroHelpUrl !== '#' && (
                    <button
                      type="button"
                      onClick={() => window.open(waRubroHelpUrl, '_blank')}
                      className="mt-1 text-sm font-medium text-violet-700 hover:text-violet-800"
                    >
                      Solicitar por WhatsApp →
                    </button>
                  )}
                </div>
              ) : (
                filteredRubros.map((r, i) => (
                  <DropdownItem
                    key={r.id}
                    name={r.name}
                    active={activeIdx === i}
                    onClick={() => pickRubro(String(r.id))}
                    onMouseEnter={() => setActiveIdx(i)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
