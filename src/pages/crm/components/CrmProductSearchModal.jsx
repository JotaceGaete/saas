import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from 'components/AppIcon';
import { formatMoney } from '../../../utils/formatMoney';

export function CrmProductSearchModal({ products, onSelect, onClose, currency = 'CLP' }) {
  const fmt = (n) => formatMoney(n, currency);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col"
        style={{ maxHeight: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Buscador */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Icon name="Search" size={16} color="#9ca3af" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto..."
            className="flex-1 text-sm text-gray-900 outline-none placeholder-gray-400 bg-transparent"
          />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No se encontraron productos
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors text-left"
              >
                <div className="min-w-0 mr-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-gray-500 truncate">{p.description}</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-900 shrink-0">
                  {fmt(p.price)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
