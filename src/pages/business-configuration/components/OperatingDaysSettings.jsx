import React, { useState, useEffect } from 'react';
import Icon from 'components/AppIcon';
import { useAuth } from '../../../contexts/AuthContext';
import { updateBusiness } from '../../../services/waBusinessService';
import { normalizeOperatingDays, hasAtLeastOneOperatingDay } from '../../../lib/finance/operatingCalendar';

const WEEKDAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const ALL_DAYS_OPEN = WEEKDAYS.reduce((acc, { key }) => ({ ...acc, [key]: true }), {});

/**
 * OperatingDaysSettings — OPERATING-CALENDAR-1.
 * Configura wa_businesses.operating_days: en qué días de la semana opera el
 * negocio. El Termómetro (CrmCostCenter) y /crm/costos usan esto para
 * prorratear los costos fijos solo entre días operativos, en vez de todos
 * los días calendario. Sin guardar (columna NULL), se preserva el
 * comportamiento histórico -- por eso el checklist arranca con todo
 * marcado la primera vez que se abre, reflejando ese modo legacy.
 */
export default function OperatingDaysSettings() {
  const { business, patchBusiness } = useAuth();
  const [selection, setSelection] = useState(ALL_DAYS_OPEN);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const normalized = normalizeOperatingDays(business?.operatingDays);
    setSelection(normalized || ALL_DAYS_OPEN);
  }, [business?.id, business?.operatingDays]);

  const toggle = (key) => {
    setSaved(false);
    setSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const valid = hasAtLeastOneOperatingDay(selection);

  const handleSave = async () => {
    if (!valid || !business?.id) return;
    setError('');
    setSaving(true);
    const { data: updated, error: err } = await updateBusiness(business.id, { operatingDays: selection });
    setSaving(false);
    if (err) {
      setError('No se pudo guardar la configuración. Intenta de nuevo.');
      return;
    }
    if (updated) patchBusiness(updated);
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
            <Icon name="CalendarDays" size={17} color="#0284c7" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Días de operación</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Elige los días en que tu negocio funciona. Se usa para calcular tu costo fijo diario en el Termómetro y en Costos.
            </p>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WEEKDAYS.map(({ key, label }) => (
              <label
                key={key}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  selection[key]
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!selection[key]}
                  onChange={() => toggle(key)}
                  className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                {label}
              </label>
            ))}
          </div>

          {!valid && (
            <p className="mt-3 text-xs text-red-600">Debes dejar marcado al menos un día operativo.</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !valid}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  Guardando…
                </>
              ) : (
                'Guardar días de operación'
              )}
            </button>
            {saved && !saving && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Icon name="Check" size={13} />
                Guardado
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <Icon name="AlertCircle" size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
