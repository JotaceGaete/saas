import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';


export default function VariantManager({ variants, onVariantsChange }) {
  const [newGroupName, setNewGroupName] = useState('');
  const [newOptionValues, setNewOptionValues] = useState({});

  const addGroup = () => {
    const name = newGroupName?.trim();
    if (!name) return;
    onVariantsChange(prev => [...prev, { id: Date.now(), name, options: [] }]);
    setNewGroupName('');
  };

  const removeGroup = (id) => {
    onVariantsChange(prev => prev?.filter(g => g?.id !== id));
  };

  const addOption = (groupId) => {
    const val = (newOptionValues?.[groupId] || '')?.trim();
    if (!val) return;
    onVariantsChange(prev => prev?.map(g =>
      g?.id === groupId ? { ...g, options: [...g?.options, { id: Date.now(), value: val }] } : g
    ));
    setNewOptionValues(prev => ({ ...prev, [groupId]: '' }));
  };

  const removeOption = (groupId, optionId) => {
    onVariantsChange(prev => prev?.map(g =>
      g?.id === groupId ? { ...g, options: g?.options?.filter(o => o?.id !== optionId) } : g
    ));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
            Variantes del producto
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Ej: Talla (S, M, L), Color (Rojo, Azul)
          </p>
        </div>
      </div>
      {/* Existing groups */}
      {variants?.map(group => (
        <div key={group?.id} className="mb-4 p-4 rounded-lg border border-border" style={{ backgroundColor: 'var(--color-muted)', borderRadius: 'var(--radius-md)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{group?.name}</span>
            <button onClick={() => removeGroup(group?.id)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors" aria-label={`Eliminar grupo ${group?.name}`}>
              <Icon name="Trash2" size={14} color="var(--color-destructive)" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {group?.options?.map(opt => (
              <span key={opt?.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(196,112,74,0.12)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                {opt?.value}
                <button onClick={() => removeOption(group?.id, opt?.id)} className="hover:opacity-70" aria-label={`Eliminar opción ${opt?.value}`}>
                  <Icon name="X" size={10} color="currentColor" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nueva opción..."
              value={newOptionValues?.[group?.id] || ''}
              onChange={(e) => setNewOptionValues(prev => ({ ...prev, [group?.id]: e?.target?.value }))}
              onKeyDown={(e) => e?.key === 'Enter' && addOption(group?.id)}
              className="flex-1 px-3 py-1.5 text-xs rounded-md border focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ borderColor: 'var(--color-input)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', borderRadius: 'var(--radius-sm)' }}
            />
            <Button variant="outline" size="sm" onClick={() => addOption(group?.id)} iconName="Plus" iconPosition="left" iconSize={12}>
              Agregar
            </Button>
          </div>
        </div>
      ))}
      {/* Add new group */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Nombre del grupo (ej: Talla)"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e?.target?.value)}
          onKeyDown={(e) => e?.key === 'Enter' && addGroup()}
          className="flex-1 px-3 py-2 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ borderColor: 'var(--color-input)', backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', borderRadius: 'var(--radius-sm)' }}
        />
        <Button variant="outline" size="default" onClick={addGroup} iconName="Plus" iconPosition="left">
          Grupo
        </Button>
      </div>
    </div>
  );
}