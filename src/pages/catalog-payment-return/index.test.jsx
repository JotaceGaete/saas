import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const getBusinessBySlugMock = vi.fn();

vi.mock('../../services/waBusinessService', () => ({
  getBusinessBySlug: (...args) => getBusinessBySlugMock(...args),
}));

import CatalogPaymentReturn from './index';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/catalogo/:slug/pago/:status" element={<CatalogPaymentReturn />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getBusinessBySlugMock.mockReset();
  getBusinessBySlugMock.mockResolvedValue({ data: { whatsapp: '+56911112222' }, error: null });
});

describe('CatalogPaymentReturn — solo UX, nunca fuente de verdad', () => {
  it('status=exito: muestra el mensaje prudente, sin afirmar categóricamente que el pedido está pagado', () => {
    renderAt('/catalogo/mi-tienda/pago/exito');
    expect(screen.getByText(/recibimos la confirmación de mercado pago/i)).toBeInTheDocument();
    // Nunca debe decir "tu pedido está pagado" / "pago confirmado" de forma categórica.
    expect(screen.queryByText(/pedido pagado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pago confirmado/i)).not.toBeInTheDocument();
  });

  it('status=pendiente: muestra "está siendo procesado"', () => {
    renderAt('/catalogo/mi-tienda/pago/pendiente');
    expect(screen.getByText(/tu pago está siendo procesado/i)).toBeInTheDocument();
  });

  it('status=error: muestra "no pudimos completar el pago"', () => {
    renderAt('/catalogo/mi-tienda/pago/error');
    expect(screen.getByText(/no pudimos completar el pago/i)).toBeInTheDocument();
  });

  it('status desconocido/inesperado -> cae al mensaje de error (nunca asume éxito por defecto)', () => {
    renderAt('/catalogo/mi-tienda/pago/algo-raro');
    expect(screen.getByText(/no pudimos completar el pago/i)).toBeInTheDocument();
  });

  it('el código fuente NUNCA actualiza wa_orders, ni llama ninguna RPC de pago, ni toca stock', async () => {
    const source = await import('./index.jsx?raw');
    const src = source.default;
    expect(src).not.toMatch(/\.from\(['"]wa_orders['"]\)/);
    expect(src).not.toMatch(/\.rpc\(['"]wa_process_merchant_payment_event['"]/);
    expect(src).not.toMatch(/\.rpc\(['"]wa_create_merchant_checkout_order['"]/);
    expect(src).not.toMatch(/crm_stock_movements/);
    expect(src).not.toMatch(/payment_status/);
  });

  it('el código fuente NUNCA lee query params del redirect de Mercado Pago (payment_id, status, etc.)', async () => {
    const source = await import('./index.jsx?raw');
    const src = source.default;
    expect(src).not.toMatch(/useSearchParams|URLSearchParams/);
  });

  it('ofrece "Volver al catálogo"', () => {
    renderAt('/catalogo/mi-tienda/pago/exito');
    expect(screen.getByText(/volver al catálogo/i)).toBeInTheDocument();
  });

  it('con whatsapp configurado, ofrece contactar por WhatsApp', async () => {
    renderAt('/catalogo/mi-tienda/pago/error');
    expect(await screen.findByText(/contactar por whatsapp/i)).toBeInTheDocument();
  });

  it('sin whatsapp configurado, no muestra el botón de WhatsApp', async () => {
    getBusinessBySlugMock.mockResolvedValue({ data: { whatsapp: null }, error: null });
    renderAt('/catalogo/mi-tienda/pago/error');
    await Promise.resolve();
    expect(screen.queryByText(/contactar por whatsapp/i)).not.toBeInTheDocument();
  });
});
