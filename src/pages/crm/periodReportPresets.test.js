import { describe, it, expect, vi } from 'vitest';

vi.mock('services/crmService', async () => {
  const actual = await vi.importActual('services/crmService');
  return { ...actual, getLocalDateString: () => '2026-09-16' };
});

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { getPresetRange, PERIOD_PRESETS } from './periodReportPresets';

const TODAY = '2026-09-16'; // miércoles

describe('PERIOD_PRESETS', () => {
  it('incluye los 9 presets del ticket, en orden, con "Personalizado" al final', () => {
    expect(PERIOD_PRESETS.map(p => p.label)).toEqual([
      'Hoy', 'Ayer', 'Esta semana', 'Semana anterior', 'Este mes', 'Mes anterior', 'Últimos 7 días', 'Últimos 30 días', 'Personalizado',
    ]);
  });
});

describe('getPresetRange', () => {
  it('hoy', () => {
    expect(getPresetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it('ayer', () => {
    expect(getPresetRange('yesterday', TODAY)).toEqual({ from: '2026-09-15', to: '2026-09-15' });
  });

  it('esta semana: lunes de la semana en curso hasta HOY (nunca días futuros de la semana)', () => {
    // 2026-09-16 es miércoles -> lunes de esa semana es 2026-09-14.
    expect(getPresetRange('thisWeek', TODAY)).toEqual({ from: '2026-09-14', to: '2026-09-16' });
  });

  it('semana anterior: lunes a domingo completos de la semana pasada', () => {
    expect(getPresetRange('lastWeek', TODAY)).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });

  it('este mes: 1° del mes hasta HOY (mes parcial en curso)', () => {
    expect(getPresetRange('thisMonth', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-16' });
  });

  it('mes anterior: mes completo (1° a último día)', () => {
    expect(getPresetRange('lastMonth', TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('mes anterior en enero cruza al diciembre del año anterior', () => {
    expect(getPresetRange('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('últimos 7 días: incluye hoy, 7 días en total', () => {
    const r = getPresetRange('last7', TODAY);
    expect(r).toEqual({ from: '2026-09-10', to: '2026-09-16' });
  });

  it('últimos 30 días: incluye hoy, 30 días en total', () => {
    const r = getPresetRange('last30', TODAY);
    expect(r).toEqual({ from: '2026-08-18', to: '2026-09-16' });
  });

  it('personalizado (o clave desconocida) retorna null -- el llamador provee from/to manualmente', () => {
    expect(getPresetRange('custom', TODAY)).toBeNull();
    expect(getPresetRange('unknown-key', TODAY)).toBeNull();
  });

  it('mes anterior en un año bisiesto calcula correctamente el último día de febrero', () => {
    expect(getPresetRange('lastMonth', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
