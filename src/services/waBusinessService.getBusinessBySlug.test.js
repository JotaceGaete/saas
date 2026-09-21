/**
 * waBusinessService.js — getBusinessBySlug() (SEGURIDAD-WALINKA-1D).
 *
 * getBusinessBySlug() es el único consumidor público (catálogo, ofertas,
 * confirmación de pedido, retorno de pago) que hacía `select('*')` sobre
 * wa_businesses -- una tabla con RLS público (wa_businesses_public_read,
 * USING (true)) para cualquier fila. RLS filtra filas, no columnas: un
 * `select('*')` expone en el payload cualquier columna reservada que
 * exista en la tabla, la use o no la UI. Este archivo prueba que la
 * consulta pública usa la whitelist explícita (PUBLIC_BUSINESS_COLUMNS) y
 * nunca vuelve a pedir bank_* ni `*`.
 *
 * Archivo nuevo y acotado a propósito, mismo criterio que
 * waBusinessService.deleteSupplier.test.js: no existe waBusinessService.test.js
 * (miles de líneas no relacionadas) -- no se amplía el alcance agregando
 * cobertura de todo el módulo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

import { getBusinessBySlug } from './waBusinessService';

const BANK_COLUMNS = [
  'bank_name',
  'bank_account_type',
  'bank_account_number',
  'bank_account_holder',
  'bank_rut',
  'bank_email',
];

beforeEach(() => fromMock.mockReset());

describe('getBusinessBySlug — SEGURIDAD-WALINKA-1D: whitelist pública, nunca select(\'*\')', () => {
  it('llama a .select() con una whitelist explícita, no con \'*\'', async () => {
    let capturedSelect = null;
    fromMock.mockImplementation(() => ({
      select: (arg) => {
        capturedSelect = arg;
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    }));

    await getBusinessBySlug('negocio-demo');

    expect(capturedSelect).not.toBeNull();
    expect(capturedSelect).not.toBe('*');
    expect(capturedSelect).not.toMatch(/(^|[,\s])\*(\s|,|$)/);
  });

  it('ninguna columna bank_* aparece en la selección pública', async () => {
    let capturedSelect = null;
    fromMock.mockImplementation(() => ({
      select: (arg) => {
        capturedSelect = arg;
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    }));

    await getBusinessBySlug('negocio-demo');

    for (const col of BANK_COLUMNS) {
      expect(capturedSelect).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('sigue pidiendo el join wa_rubros(name, slug) (no rompe rubroName/rubroSlug del mapper)', async () => {
    let capturedSelect = null;
    fromMock.mockImplementation(() => ({
      select: (arg) => {
        capturedSelect = arg;
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    }));

    await getBusinessBySlug('negocio-demo');

    expect(capturedSelect).toMatch(/wa_rubros\(name,\s*slug\)/);
  });

  it('sigue filtrando por slug e is_active=true (comportamiento preexistente, no debe cambiar)', async () => {
    const eqCalls = [];
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: (...args) => {
          eqCalls.push(args);
          return {
            eq: (...args2) => {
              eqCalls.push(args2);
              return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
            },
          };
        },
      }),
    }));

    await getBusinessBySlug('negocio-demo');

    expect(eqCalls).toEqual([
      ['slug', 'negocio-demo'],
      ['is_active', true],
    ]);
  });
});
