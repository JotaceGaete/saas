import React, { useEffect, useId, useRef, useState } from 'react';
import { COUNTRY_CODES, getCountryConfig } from '../../config/countryConfig';
import Icon from '../AppIcon';

const SORTED = [...COUNTRY_CODES].sort((a, b) =>
  getCountryConfig(a).name.localeCompare(getCountryConfig(b).name, 'es'),
);

/**
 * Reemplaza el <select> nativo del selector de país para que los emoji de bandera
 * sean visibles. Los <option> nativos no renderizan contenido enriquecido en la
 * mayoría de navegadores/OS — el texto se pinta con el font del sistema, donde los
 * emoji de bandera frecuentemente se recortan o no aparecen.
 *
 * Contrato idéntico a CountryIsoSelect: value = código ISO, onChange = (code) => void.
 */
export default function CountryFlagDropdown({
  value,
  onChange,
  disabled = false,
  className = '',
  style = {},
  placeholderOption = 'Selecciona país',
}) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (code) => `${uid}-opt-${code}`;

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const selectedCode = value || '';
  const selectedCfg = selectedCode ? getCountryConfig(selectedCode) : null;

  // ── Cierre al hacer click fuera ───────────────────────────────────────────
  useEffect(() => {
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // ── Scroll al item activo por teclado ─────────────────────────────────────
  useEffect(() => {
    if (!open || activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIdx];
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openDropdown() {
    if (disabled) return;
    const idx = selectedCode ? SORTED.indexOf(selectedCode) : -1;
    setActiveIdx(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    // Devuelve el foco al trigger para que el usuario no quede desorientado
    triggerRef.current?.focus();
  }

  function pick(code) {
    onChange?.(code || null);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, SORTED.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIdx >= 0) pick(SORTED[activeIdx]);
        break;
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        closeDropdown();
        break;
      default:
        break;
    }
  }

  // ── Trigger classes ───────────────────────────────────────────────────────
  // `className` proviene del padre (inputClass) e incluye outline-none + focus:ring-*.
  // Añadimos flex + cursor; open activa el ring/border directamente.
  const triggerClass = [
    className,
    'flex items-center justify-between gap-2 text-left select-none',
    disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
    open ? 'ring-4 ring-violet-500/10 border-violet-500' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const activeOptionId = activeIdx >= 0 ? optionId(SORTED[activeIdx]) : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? activeOptionId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        className={triggerClass}
        style={style}
      >
        {selectedCfg ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none" aria-hidden="true">
              {selectedCfg.flag}
            </span>
            <span className="truncate">{selectedCfg.name}</span>
          </span>
        ) : (
          <span className="text-slate-400 truncate">{placeholderOption}</span>
        )}

        {/* Chevron: envuelto en span para controlar la rotación sin pasar className a Icon */}
        <span
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <Icon name="ChevronDown" size={16} color="currentColor" />
        </span>
      </button>

      {/* ── Listbox ── */}
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="País"
          tabIndex={-1}
          className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-y-auto max-h-60 py-1 outline-none"
          style={{ fontFamily: 'var(--font-caption)' }}
        >
          {SORTED.map((code, i) => {
            const cfg = getCountryConfig(code);
            const isSelected = code === selectedCode;
            const isActive = i === activeIdx;
            return (
              <li
                key={code}
                id={optionId(code)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(i)}
                // onMouseDown + preventDefault evita que el trigger pierda foco antes
                // del click, lo que dispararía el cierre por blur antes de pick()
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(code)}
                className={[
                  'flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors',
                  isActive ? 'bg-violet-50 text-violet-800' : 'text-slate-800',
                  isSelected ? 'font-semibold' : '',
                ].join(' ')}
              >
                <span className="text-base leading-none shrink-0" aria-hidden="true">
                  {cfg.flag}
                </span>
                <span className="flex-1 truncate">{cfg.name}</span>
                {isSelected && (
                  <span aria-hidden="true" className="shrink-0 text-violet-500">
                    <Icon name="Check" size={14} color="currentColor" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
