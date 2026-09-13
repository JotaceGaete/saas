import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_KEYS, normalizeOperatingDays, isOperatingDay, getOperatingDaysForMonth,
  calculateFixedCostPerOperatingDay, hasAtLeastOneOperatingDay,
} from './operatingCalendar';

// Septiembre 2026 (usado en varios tests): día 1 = martes, día 5 = sábado,
// día 6 = domingo, 30 días calendario en total. Confirmado con
// `new Date(2026, 8, d).getDay()`.
const MON_SAT_SCHEDULE = {
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
};
const MON_FRI_SCHEDULE = {
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false,
};

describe('normalizeOperatingDays', () => {
  it('null/undefined/tipos inesperados devuelven null (modo legacy)', () => {
    expect(normalizeOperatingDays(null)).toBeNull();
    expect(normalizeOperatingDays(undefined)).toBeNull();
    expect(normalizeOperatingDays('lunes a viernes')).toBeNull();
    expect(normalizeOperatingDays(42)).toBeNull();
    expect(normalizeOperatingDays([])).toBeNull();
  });

  it('un objeto válido se devuelve con las 7 claves, valores booleanizados', () => {
    const result = normalizeOperatingDays(MON_FRI_SCHEDULE);
    expect(Object.keys(result).sort()).toEqual([...WEEKDAY_KEYS].sort());
    expect(result.monday).toBe(true);
    expect(result.sunday).toBe(false);
  });

  it('claves faltantes se normalizan a false (nunca undefined)', () => {
    const result = normalizeOperatingDays({ monday: true });
    expect(result.tuesday).toBe(false);
    expect(result.sunday).toBe(false);
  });

  it('valores no-booleanos (truthy/falsy) se coercen correctamente', () => {
    const result = normalizeOperatingDays({ monday: 1, tuesday: 0, wednesday: 'si', thursday: '' });
    expect(result.monday).toBe(true);
    expect(result.tuesday).toBe(false);
    expect(result.wednesday).toBe(true);
    expect(result.thursday).toBe(false);
  });
});

describe('isOperatingDay', () => {
  it('sin configuración (null), cualquier día es operativo -- comportamiento legacy', () => {
    for (let d = 1; d <= 7; d++) expect(isOperatingDay(null, new Date(2026, 8, d))).toBe(true);
  });

  it('con lunes-sábado configurado, el domingo NO es operativo', () => {
    // 2026-09-06 es domingo.
    expect(isOperatingDay(MON_SAT_SCHEDULE, new Date(2026, 8, 6))).toBe(false);
    // 2026-09-05 es sábado.
    expect(isOperatingDay(MON_SAT_SCHEDULE, new Date(2026, 8, 5))).toBe(true);
    // 2026-09-01 es martes.
    expect(isOperatingDay(MON_SAT_SCHEDULE, new Date(2026, 8, 1))).toBe(true);
  });

  it('un lunes programado sigue siendo operativo aunque no haya ventas ese día -- esto no es responsabilidad de isOperatingDay, pero confirma que solo mira el día de la semana', () => {
    expect(isOperatingDay(MON_FRI_SCHEDULE, new Date(2026, 8, 7))).toBe(true); // lunes
  });
});

describe('getOperatingDaysForMonth', () => {
  it('sin configuración, devuelve exactamente daysInMonth (comportamiento legacy preservado)', () => {
    expect(getOperatingDaysForMonth(null, 9, 2026)).toBe(30);
    expect(getOperatingDaysForMonth(undefined, 2, 2026)).toBe(28);
  });

  it('lunes a sábado en septiembre 2026 (30 días, 4 domingos: 6,13,20,27) da 26 días operativos', () => {
    expect(getOperatingDaysForMonth(MON_SAT_SCHEDULE, 9, 2026)).toBe(26);
  });

  it('lunes a viernes en septiembre 2026 (4 sábados + 4 domingos cerrados) da 22 días operativos', () => {
    expect(getOperatingDaysForMonth(MON_FRI_SCHEDULE, 9, 2026)).toBe(22);
  });

  it('cambiar de mes recalcula N -- febrero 2026 (28 días) tiene menos días operativos que septiembre (30 días)', () => {
    const septiembre = getOperatingDaysForMonth(MON_FRI_SCHEDULE, 9, 2026);
    const febrero = getOperatingDaysForMonth(MON_FRI_SCHEDULE, 2, 2026);
    expect(septiembre).toBe(22);
    expect(febrero).toBe(20);
    expect(febrero).not.toBe(septiembre);
  });

  it('todos los días marcados false da 0 (caso inválido que la UI ya impide guardar, pero no debe lanzar)', () => {
    const allClosed = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };
    expect(() => getOperatingDaysForMonth(allClosed, 9, 2026)).not.toThrow();
    expect(getOperatingDaysForMonth(allClosed, 9, 2026)).toBe(0);
  });
});

describe('calculateFixedCostPerOperatingDay', () => {
  it('461.000 / 21 días operativos = 21.952,38... (precisión completa, sin redondear)', () => {
    expect(calculateFixedCostPerOperatingDay(461000, 21)).toBeCloseTo(21952.380952380953, 9);
  });

  it('la suma de ese valor repetido N veces reconstruye el total mensual, salvo error de redondeo (acá: exacto, sin redondeo de por medio)', () => {
    const perDay = calculateFixedCostPerOperatingDay(461000, 21);
    expect(perDay * 21).toBeCloseTo(461000, 9);
  });

  it('0 días operativos devuelve 0, nunca Infinity/NaN', () => {
    expect(calculateFixedCostPerOperatingDay(461000, 0)).toBe(0);
    expect(calculateFixedCostPerOperatingDay(461000, -5)).toBe(0);
  });

  it('0 costos fijos devuelve 0', () => {
    expect(calculateFixedCostPerOperatingDay(0, 21)).toBe(0);
  });

  it('nunca lanza con entradas no numéricas', () => {
    expect(() => calculateFixedCostPerOperatingDay(undefined, undefined)).not.toThrow();
    expect(calculateFixedCostPerOperatingDay('abc', 'xyz')).toBe(0);
  });
});

describe('hasAtLeastOneOperatingDay', () => {
  it('sin configuración, siempre true (legacy)', () => {
    expect(hasAtLeastOneOperatingDay(null)).toBe(true);
  });

  it('con al menos un día true, es true', () => {
    expect(hasAtLeastOneOperatingDay({ sunday: true })).toBe(true);
  });

  it('con los 7 días false, es false', () => {
    expect(hasAtLeastOneOperatingDay({
      monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false,
    })).toBe(false);
  });
});
