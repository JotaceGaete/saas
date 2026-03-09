import React from 'react';
import Icon from 'components/AppIcon';
import Input from 'components/ui/Input';

const DELIVERY_TYPES = [
  { key: 'pickup', label: 'Retiro en tienda', icon: 'Store' },
  { key: 'local', label: 'Entrega local', icon: 'Bike' },
  { key: 'nacional', label: 'Envío nacional', icon: 'Truck' },
];

export default function DeliveryOptions({ delivery, onChange }) {
  const toggleType = (key) => {
    const types = delivery?.types?.includes(key)
      ? delivery?.types?.filter((t) => t !== key)
      : [...delivery?.types, key];
    onChange({ ...delivery, types });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DELIVERY_TYPES?.map(({ key, label, icon }) => {
          const active = delivery?.types?.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleType(key)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: active ? 'rgba(196,112,74,0.06)' : 'var(--color-card)',
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: active ? 'rgba(196,112,74,0.15)' : 'var(--color-muted)' }}
              >
                <Icon name={icon} size={20} color={active ? 'var(--color-primary)' : 'var(--color-muted-foreground)'} />
              </div>
              <span
                className={`text-sm font-medium text-center ${active ? 'text-foreground' : 'text-muted-foreground'}`}
                style={{ fontFamily: 'var(--font-caption)' }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {delivery?.types?.includes('local') && (
        <Input
          label="Costo de entrega local"
          type="number"
          placeholder="Ej: 5000"
          value={delivery?.localCost}
          onChange={(e) => onChange({ ...delivery, localCost: e?.target?.value })}
          description="Ingresa 0 para envío gratis"
        />
      )}
      {delivery?.types?.includes('nacional') && (
        <Input
          label="Información de envío nacional"
          type="text"
          placeholder="Ej: Coordinamos por WhatsApp según destino"
          value={delivery?.nationalInfo}
          onChange={(e) => onChange({ ...delivery, nationalInfo: e?.target?.value })}
        />
      )}
    </div>
  );
}