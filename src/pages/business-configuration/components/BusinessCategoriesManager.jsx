import React, { useEffect, useState, useCallback } from 'react';
import Icon from 'components/AppIcon';
import {
  getBusinessCategories,
  createBusinessCategory,
  updateBusinessCategory,
  deleteBusinessCategory,
  countProductsInBusinessCategory,
} from '../../../services/waBusinessService';

const LIMIT = 30;
const NAME_MAX = 60;

export default function BusinessCategoriesManager({ business }) {
  const businessId = business?.id;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name, productCount }

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data } = await getBusinessCategories(businessId);
    setCategories(data || []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  // ── Agregar ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.length > NAME_MAX) { setAddError(`Máximo ${NAME_MAX} caracteres`); return; }
    setAdding(true);
    setAddError(null);
    const { data, error } = await createBusinessCategory(businessId, {
      name: trimmed,
      sortOrder: categories.length,
    });
    setAdding(false);
    if (error) { setAddError(error.message); return; }
    setNewName('');
    setCategories((prev) => [...prev, data]);
  };

  // ── Editar ───────────────────────────────────────────────────────────────
  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditError(null);
  };

  const handleSaveEdit = async (cat) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditError('El nombre es obligatorio'); return; }
    if (trimmed === cat.name) { setEditingId(null); return; }
    setSavingId(cat.id);
    setEditError(null);
    const { data, error } = await updateBusinessCategory(cat.id, businessId, { name: trimmed });
    setSavingId(null);
    if (error) { setEditError(error.message); return; }
    setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    setEditingId(null);
  };

  // ── Eliminar ─────────────────────────────────────────────────────────────
  const handleDeleteRequest = async (cat) => {
    const count = await countProductsInBusinessCategory(businessId, cat.name);
    setDeleteConfirm({ id: cat.id, name: cat.name, productCount: count });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    const { error } = await deleteBusinessCategory(deleteConfirm.id, businessId, { desassignProducts: true });
    if (!error) {
      setCategories((prev) => prev.filter((c) => c.id !== deleteConfirm.id));
    }
    setDeleteConfirm(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const atLimit = categories.length >= LIMIT;

  return (
    <div>
      {/* Lista de categorías existentes */}
      {loading ? (
        <div className="text-sm py-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Cargando…
        </div>
      ) : categories.length === 0 ? (
        <p className="text-sm mb-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Aún no tienes categorías propias. Agrégalas abajo.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }}
            >
              {editingId === cat.id ? (
                <>
                  <input
                    autoFocus
                    className="flex-1 text-sm px-2 py-1 rounded border"
                    style={{ borderColor: editError ? 'var(--color-error)' : 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                    value={editName}
                    maxLength={NAME_MAX}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(cat);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    disabled={savingId === cat.id}
                    onClick={() => handleSaveEdit(cat)}
                    className="p-1.5 rounded-lg disabled:opacity-50"
                    style={{ color: 'var(--color-primary)' }}
                    aria-label="Guardar"
                  >
                    <Icon name="Check" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="p-1.5 rounded-lg"
                    style={{ color: 'var(--color-muted-foreground)' }}
                    aria-label="Cancelar"
                  >
                    <Icon name="X" size={15} />
                  </button>
                  {editError && (
                    <span className="text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{editError}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                    {cat.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(cat)}
                    className="p-1.5 rounded-lg hover:bg-white transition-colors"
                    style={{ color: 'var(--color-muted-foreground)' }}
                    aria-label={`Editar ${cat.name}`}
                  >
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRequest(cat)}
                    className="p-1.5 rounded-lg hover:bg-white transition-colors"
                    style={{ color: 'var(--color-muted-foreground)' }}
                    aria-label={`Eliminar ${cat.name}`}
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Input para agregar */}
      {!atLimit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Ej: Tortas personalizadas"
            maxLength={NAME_MAX}
            className="flex-1 text-sm px-3 py-2 rounded-lg border"
            style={{
              borderColor: addError ? 'var(--color-error)' : 'var(--color-border)',
              fontFamily: 'var(--font-caption)',
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          >
            <Icon name="Plus" size={15} color="#fff" />
            Agregar
          </button>
        </div>
      )}
      {addError && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{addError}</p>
      )}
      {atLimit && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Límite de {LIMIT} categorías propias alcanzado.
        </p>
      )}
      <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        {categories.length}/{LIMIT} categorías · Escribe el nombre y presiona Enter o "Agregar"
      </p>

      {/* Modal de confirmación de borrado */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-5 shadow-xl" style={{ backgroundColor: '#fff', borderColor: 'var(--color-border)' }}>
            <h3 className="text-base font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Eliminar categoría
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              ¿Eliminar <strong style={{ color: 'var(--color-foreground)' }}>{deleteConfirm.name}</strong>?
              {deleteConfirm.productCount > 0 && (
                <> <br /><br />
                  <span style={{ color: 'var(--color-error)' }}>
                    {deleteConfirm.productCount} producto{deleteConfirm.productCount !== 1 ? 's' : ''} quedarán sin categoría.
                  </span>
                </>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm rounded-lg border"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white"
                style={{ backgroundColor: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
