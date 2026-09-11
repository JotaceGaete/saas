/**
 * waBusinessService.js — deleteSupplier (PROVEEDORES-CORE-3 review fix).
 *
 * wa_supplier_invoices.supplier_id -> wa_suppliers(id) ON DELETE RESTRICT
 * (PROVEEDORES-CORE-2): un proveedor con facturas nunca se puede borrar.
 * Este test cubre específicamente que ese 23503 se traduce a un mensaje
 * legible en la capa de servicio, no en la página -- así cualquier caller
 * futuro (no solo suppliers/index.jsx) recibe ya un Error de dominio.
 *
 * Archivo nuevo y acotado a propósito: no existía waBusinessService.test.js
 * (ese archivo tiene miles de líneas de lógica no relacionada con
 * proveedores) -- no se amplía el alcance de este fix agregando cobertura
 * de todo el módulo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

import { deleteSupplier } from './waBusinessService';

beforeEach(() => fromMock.mockReset());

describe('deleteSupplier — proveedor con facturas (FK RESTRICT)', () => {
  it('23503 se traduce a un mensaje legible -- nunca el error de Postgres crudo', async () => {
    fromMock.mockImplementation(() => ({
      delete: () => ({
        eq: () => Promise.resolve({
          error: { code: '23503', message: 'update or delete on table "wa_suppliers" violates foreign key constraint "wa_supplier_invoices_supplier_id_fkey"' },
        }),
      }),
    }));
    const { error } = await deleteSupplier('sup1');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toMatch(/foreign key|constraint|violates/i);
    expect(error.message).toMatch(/facturas registradas/i);
  });

  it('proveedor sin facturas -- delete procede sin error', async () => {
    fromMock.mockImplementation(() => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }));
    const { error } = await deleteSupplier('sup2');
    expect(error).toBeNull();
  });

  it('otro error (no 23503) se propaga tal cual, sin reescribirlo', async () => {
    const original = { code: '500', message: 'network failure' };
    fromMock.mockImplementation(() => ({
      delete: () => ({ eq: () => Promise.resolve({ error: original }) }),
    }));
    const { error } = await deleteSupplier('sup3');
    expect(error).toBe(original);
  });
});
