// Compatibilidad: el tratamiento tributario solo viaja a la base cuando el editor lo pasa
// (facturación activada). Sin él, el guardado de productos queda exactamente igual que antes.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates = [];
const builder = (table) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => ({ data: table === 'wa_products' ? { id: 'p1', business_id: 'b1', is_active: true, status: 'active' } : { plan_slug: 'pro' }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    update: (payload) => { updates.push({ table, payload }); return chain; },
    then: (resolve) => resolve({ data: [], error: null, count: 0 }),
  };
  return chain;
};
vi.mock('../lib/supabase', () => ({ supabase: { from: (t) => builder(t), auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) }, rpc: vi.fn(async () => ({ data: null, error: null })) } }));

const { updateProduct } = await import('./waBusinessService');

beforeEach(() => { updates.length = 0; });

describe('updateProduct y tax_treatment', () => {
  it('sin taxTreatment no envía la columna (productos y bases actuales intactos)', async () => {
    await updateProduct('p1', { name: 'Café', isActive: false });
    const productUpdates = updates.filter((u) => u.table === 'wa_products');
    expect(productUpdates.length).toBeGreaterThan(0);
    expect(productUpdates.every((u) => !('tax_treatment' in u.payload))).toBe(true);
  });

  it('con taxTreatment lo envía; vacío se guarda como NULL (usar el del negocio)', async () => {
    await updateProduct('p1', { name: 'Café', isActive: false, taxTreatment: 'EXENTO' });
    expect(updates.some((u) => u.table === 'wa_products' && u.payload.tax_treatment === 'EXENTO')).toBe(true);
    updates.length = 0;
    await updateProduct('p1', { name: 'Café', isActive: false, taxTreatment: '' });
    expect(updates.some((u) => u.table === 'wa_products' && u.payload.tax_treatment === null)).toBe(true);
  });
});
