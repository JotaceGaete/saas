import React, { useState, useEffect, useMemo } from 'react';
import Icon from 'components/AppIcon';

function normalizeSearch(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
import {
  getRubros,
  getCategoriesByRubroId,
  createRubro,
  updateRubro,
  deleteRubro,
  createRubroCategory,
  updateRubroCategory,
  deleteRubroCategory,
} from 'services/waBusinessService';

export default function AdminRubrosSection() {
  const [rubros, setRubros] = useState([]);
  const [categoriesByRubro, setCategoriesByRubro] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRubro, setExpandedRubro] = useState(null);
  const [editingRubro, setEditingRubro] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newRubroName, setNewRubroName] = useState('');
  const [newRubroSlug, setNewRubroSlug] = useState('');
  const [newRubroSlugDirty, setNewRubroSlugDirty] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState({});
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRubros = async () => {
    const { data, error: err } = await getRubros();
    if (err) { setError(err?.message || 'Error al cargar rubros'); return; }
    setRubros(data || []);
    setError(null);
  };

  const loadCategoriesForRubro = async (rubroId) => {
    const { data } = await getCategoriesByRubroId(rubroId);
    setCategoriesByRubro((prev) => ({ ...prev, [rubroId]: data || [] }));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadRubros();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (expandedRubro && !categoriesByRubro[expandedRubro]) {
      loadCategoriesForRubro(expandedRubro);
    }
  }, [expandedRubro]);

  const filteredRubros = useMemo(() => {
    const q = normalizeSearch(searchQuery.trim());
    if (!q) return rubros;
    return rubros.filter(
      (r) =>
        normalizeSearch(r?.name).includes(q) ||
        normalizeSearch(r?.slug).includes(q),
    );
  }, [rubros, searchQuery]);

  const slugFromName = (name) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'rubro';

  const handleCreateRubro = async (e) => {
    e?.preventDefault?.();
    const name = newRubroName?.trim();
    if (!name) return;
    const slug = newRubroSlug.trim() || slugFromName(name);
    setSaving(true);
    const { data, error: err } = await createRubro({ name, slug });
    setSaving(false);
    if (err) { setError(err?.message || 'Error al crear rubro'); return; }
    setNewRubroName('');
    setNewRubroSlug('');
    setNewRubroSlugDirty(false);
    await loadRubros();
  };

  const handleUpdateRubro = async (id, payload) => {
    setSaving(true);
    const { error: err } = await updateRubro(id, payload);
    setSaving(false);
    if (err) { setError(err?.message || 'Error al actualizar'); return; }
    setEditingRubro(null);
    await loadRubros();
  };

  const handleDeleteRubro = async (id) => {
    if (!window.confirm('¿Eliminar este rubro y todas sus categorías?')) return;
    setSaving(true);
    const { error: err } = await deleteRubro(id);
    setSaving(false);
    if (err) { setError(err?.message || 'Error al eliminar'); return; }
    setExpandedRubro((prev) => (prev === id ? null : prev));
    await loadRubros();
    setCategoriesByRubro((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleCreateCategory = async (rubroId) => {
    const name = (newCategoryName[rubroId] || '').trim();
    if (!name) return;
    setSaving(true);
    const { error: err } = await createRubroCategory({ rubroId, name });
    setSaving(false);
    if (err) { setError(err?.message || 'Error al crear categoría'); return; }
    setNewCategoryName((prev) => ({ ...prev, [rubroId]: '' }));
    await loadCategoriesForRubro(rubroId);
  };

  const handleUpdateCategory = async (id, rubroId, payload) => {
    setSaving(true);
    const { error: err } = await updateRubroCategory(id, payload);
    setSaving(false);
    if (err) { setError(err?.message || 'Error al actualizar'); return; }
    setEditingCategory(null);
    await loadCategoriesForRubro(rubroId);
  };

  const handleDeleteCategory = async (id, rubroId) => {
    if (!window.confirm('¿Eliminar esta categoría?')) return;
    setSaving(true);
    const { error: err } = await deleteRubroCategory(id);
    setSaving(false);
    if (err) { setError(err?.message || 'Error al eliminar'); return; }
    await loadCategoriesForRubro(rubroId);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Cargando rubros…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
          <Icon name="AlertCircle" size={18} />
          <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs underline">Cerrar</button>
        </div>
      )}

      <form onSubmit={handleCreateRubro} className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Nombre</label>
          <input
            type="text"
            value={newRubroName}
            onChange={(e) => {
              const v = e.target.value;
              setNewRubroName(v);
              if (!newRubroSlugDirty) setNewRubroSlug(slugFromName(v));
            }}
            placeholder="Ej: Botillería"
            className="px-3 py-2 rounded-lg border text-sm w-44"
            style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Slug</label>
          <input
            type="text"
            value={newRubroSlug}
            onChange={(e) => { setNewRubroSlug(e.target.value); setNewRubroSlugDirty(true); }}
            placeholder="ej: botilleria"
            className="px-3 py-2 rounded-lg border text-sm w-44 font-mono"
            style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
          />
        </div>
        <button
          type="submit"
          disabled={saving || !newRubroName?.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
        >
          <Icon name="Plus" size={14} color="#fff" />
          Agregar rubro
        </button>
      </form>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-muted-foreground)' }}>
          <Icon name="Search" size={15} color="currentColor" />
        </span>
        <input
          type="search"
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar rubro por nombre o slug..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
          aria-label="Buscar rubro"
        />
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
        <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
          <thead>
            <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3">Rubro</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--color-foreground)' }}>
            {filteredRubros.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {searchQuery.trim() ? `Sin resultados para "${searchQuery}"` : 'No hay rubros aún.'}
                </td>
              </tr>
            )}
            {filteredRubros.map((rubro) => (
              <React.Fragment key={rubro.id}>
                <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedRubro((prev) => (prev === rubro.id ? null : rubro.id))}
                      className="p-1 rounded hover:bg-muted"
                      aria-label={expandedRubro === rubro.id ? 'Cerrar' : 'Ver categorías'}
                    >
                      <Icon name={expandedRubro === rubro.id ? 'ChevronDown' : 'ChevronRight'} size={16} color="currentColor" />
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    {editingRubro?.id === rubro.id ? (
                      <input
                        type="text"
                        value={editingRubro.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingRubro((prev) => ({
                            ...prev,
                            name: v,
                            slug: prev.slugDirty ? prev.slug : slugFromName(v),
                          }));
                        }}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingRubro(null); }}
                        className="px-2 py-1 text-sm border rounded w-40"
                        style={{ borderColor: 'var(--color-border)' }}
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{rubro.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                    {editingRubro?.id === rubro.id ? (
                      <input
                        type="text"
                        value={editingRubro.slug}
                        onChange={(e) =>
                          setEditingRubro((prev) => ({ ...prev, slug: e.target.value, slugDirty: true }))
                        }
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingRubro(null); }}
                        className="px-2 py-1 text-sm border rounded w-36 font-mono"
                        style={{ borderColor: 'var(--color-border)' }}
                      />
                    ) : (
                      rubro.slug
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editingRubro?.id === rubro.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateRubro(rubro.id, { name: editingRubro.name, slug: editingRubro.slug })}
                          className="p-1.5 rounded hover:bg-green-50 text-green-600"
                          title="Guardar"
                        >
                          <Icon name="Check" size={14} color="currentColor" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRubro(null)}
                          className="p-1.5 rounded hover:bg-muted"
                          title="Cancelar"
                        >
                          <Icon name="X" size={14} color="currentColor" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button type="button" onClick={() => setEditingRubro({ id: rubro.id, name: rubro.name, slug: rubro.slug, slugDirty: false })} className="p-1.5 rounded hover:bg-muted mr-1" title="Editar"><Icon name="Pencil" size={14} color="currentColor" /></button>
                        <button type="button" onClick={() => handleDeleteRubro(rubro.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Eliminar"><Icon name="Trash2" size={14} color="currentColor" /></button>
                      </>
                    )}
                  </td>
                </tr>
                {expandedRubro === rubro.id && (
                  <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="pl-6 space-y-2">
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)' }}>Categorías de este rubro</p>
                        <ul className="space-y-1">
                          {(categoriesByRubro[rubro.id] || []).map((cat) => (
                            <li key={cat.id} className="flex items-center gap-2">
                              {editingCategory === cat.id ? (
                                <input
                                  type="text"
                                  defaultValue={cat.name}
                                  onKeyDown={(e) => { if (e?.key === 'Enter') handleUpdateCategory(cat.id, rubro.id, { name: e?.target?.value }); if (e?.key === 'Escape') setEditingCategory(null); }}
                                  onBlur={(e) => { const v = e?.target?.value?.trim(); if (v && v !== cat.name) handleUpdateCategory(cat.id, rubro.id, { name: v }); setEditingCategory(null); }}
                                  className="px-2 py-1 text-sm border rounded flex-1 max-w-xs"
                                  style={{ borderColor: 'var(--color-border)' }}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-sm">{cat.name}</span>
                              )}
                              {editingCategory !== cat.id && (
                                <>
                                  <button type="button" onClick={() => setEditingCategory(cat.id)} className="p-1 rounded hover:bg-muted" title="Editar"><Icon name="Pencil" size={12} color="currentColor" /></button>
                                  <button type="button" onClick={() => handleDeleteCategory(cat.id, rubro.id)} className="p-1 rounded hover:bg-red-50 text-red-600" title="Eliminar"><Icon name="Trash2" size={12} color="currentColor" /></button>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2 items-center mt-2">
                          <input
                            type="text"
                            value={newCategoryName[rubro.id] ?? ''}
                            onChange={(e) => setNewCategoryName((prev) => ({ ...prev, [rubro.id]: e?.target?.value }))}
                            placeholder="Nueva categoría"
                            className="px-2 py-1.5 text-sm border rounded w-48"
                            style={{ borderColor: 'var(--color-border)' }}
                            onKeyDown={(e) => { if (e?.key === 'Enter') { e.preventDefault(); handleCreateCategory(rubro.id); } }}
                          />
                          <button
                            type="button"
                            onClick={() => handleCreateCategory(rubro.id)}
                            disabled={saving || !(newCategoryName[rubro.id] || '')?.trim()}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            <Icon name="Plus" size={12} color="#fff" />
                            Agregar categoría
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
