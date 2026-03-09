import React from 'react';
import Icon from 'components/AppIcon';

const DAYS = [
  { key: 'lun', label: 'Lunes' },
  { key: 'mar', label: 'Martes' },
  { key: 'mie', label: 'Miércoles' },
  { key: 'jue', label: 'Jueves' },
  { key: 'vie', label: 'Viernes' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

export default function BusinessHours({ hours, onChange }) {
  const toggleDay = (key) => {
    onChange({
      ...hours,
      [key]: { ...hours?.[key], enabled: !hours?.[key]?.enabled },
    });
  };

  const updateTime = (key, field, value) => {
    onChange({
      ...hours,
      [key]: { ...hours?.[key], [field]: value },
    });
  };

  return (
    <div className="space-y-2">
      {DAYS?.map(({ key, label }) => {
        const day = hours?.[key] || { enabled: false, open: '09:00', close: '18:00' };
        return (
          <div
            key={key}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--color-muted)' }}
          >
            <button
              type="button"
              onClick={() => toggleDay(key)}
              className={`flex items-center gap-2 min-w-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-250 flex-shrink-0`}
                style={{ backgroundColor: day?.enabled ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                {day?.enabled && <Icon name="Check" size={12} color="#fff" />}
              </div>
              <span
                className={`text-sm font-medium ${day?.enabled ? 'text-foreground' : 'text-muted-foreground'}`}
                style={{ fontFamily: 'var(--font-caption)' }}
              >
                {label}
              </span>
            </button>
            {day?.enabled ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={day?.open}
                  onChange={(e) => updateTime(key, 'open', e?.target?.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-data)',
                  }}
                />
                <span className="text-muted-foreground text-sm flex-shrink-0">—</span>
                <input
                  type="time"
                  value={day?.close}
                  onChange={(e) => updateTime(key, 'close', e?.target?.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-foreground)',
                    fontFamily: 'var(--font-data)',
                  }}
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground" style={{ fontFamily: 'var(--font-caption)' }}>
                Cerrado
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}