import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a) => invoke(...a) },
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  },
}));

import TpvFiscalEmitPanel from './TpvFiscalEmitPanel';

const statusReply = (data) => ({ data, error: null });
const calls = (action) => invoke.mock.calls.filter(([, o]) => o.body.action === action).length;

describe('TpvFiscalEmitPanel', () => {
  beforeEach(() => invoke.mockReset());

  it('apagado: no renderiza ni consulta nada', () => {
    const { container } = render(<TpvFiscalEmitPanel saleId="s1" businessId="b1" total={100} enabled={false} />);
    expect(container.innerHTML).toBe('');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('al desactivar el módulo fiscal no realiza emisiones ni consultas, aunque exista una venta', async () => {
    const { rerender, container } = render(
      <TpvFiscalEmitPanel saleId="venta-1" businessId="negocio-1" total={1000} enabled={false} />,
    );
    rerender(<TpvFiscalEmitPanel saleId="venta-2" businessId="negocio-1" total={2000} enabled={false} />);
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('bloqueada por el servidor: botón deshabilitado con el motivo', async () => {
    invoke.mockResolvedValueOnce(statusReply({ state: 'none', canEmit: false, blockedReason: 'SALE_NOT_SAME_DAY' }));
    render(<TpvFiscalEmitPanel saleId="s1" businessId="b1" total={100} enabled />);
    expect(await screen.findByText(/ventas del día/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir boleta electrónica' })).toBeDisabled();
  });

  it('exige confirmación explícita y emite una sola vez', async () => {
    invoke
      .mockResolvedValueOnce(statusReply({ state: 'none', canEmit: true }))
      .mockResolvedValueOnce({ data: { status: 'issued', folio: 51107 }, error: null })
      .mockResolvedValueOnce(statusReply({ state: 'issued', folio: 51107, siiStatus: 'unverified', hasPdf: true, hasXml: true, canEmit: false }));
    render(<TpvFiscalEmitPanel saleId="s1" businessId="b1" total={100} enabled />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir boleta electrónica' }));
    const emitNow = screen.getByRole('button', { name: 'Emitir ahora' });
    expect(emitNow).toBeDisabled(); // sin la casilla no se puede
    expect(calls('emit')).toBe(0);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(emitNow);
    fireEvent.click(emitNow);
    expect(await screen.findByText(/Folio 51107/)).toBeInTheDocument();
    expect(calls('emit')).toBe(1);
    // Emitida no es aceptada: el estado SII se muestra aparte.
    expect(screen.getByTestId('sii-status').textContent).toMatch(/sin verificar/);
    expect(screen.getByRole('button', { name: 'Descargar XML' })).toBeInTheDocument();
  });

  it('resultado incierto: bloquea, no reintenta y lo dice', async () => {
    invoke
      .mockResolvedValueOnce(statusReply({ state: 'none', canEmit: true }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(statusReply({ state: 'sending', canEmit: false, blockedReason: 'ALREADY_IN_PROGRESS' }));
    render(<TpvFiscalEmitPanel saleId="s1" businessId="b1" total={100} enabled />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir boleta electrónica' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Emitir ahora' }));
    expect(await screen.findByText(/Resultado pendiente de confirmar/)).toBeInTheDocument();
    await waitFor(() => expect(calls('status')).toBe(2));
    expect(calls('emit')).toBe(1);
    expect(screen.queryByRole('button', { name: 'Emitir boleta electrónica' })).toBeNull();
  });

  it('venta ya aceptada por el SII: muestra folio y aceptación, sin botón de emitir', async () => {
    invoke.mockResolvedValueOnce(statusReply({ state: 'issued', folio: 51106, siiStatus: 'accepted', siiTrackId: '24416614851', hasPdf: true, hasXml: true }));
    render(<TpvFiscalEmitPanel saleId="s1" businessId="b1" total={100} enabled />);
    expect(await screen.findByText(/Folio 51106/)).toBeInTheDocument();
    expect(screen.getByTestId('sii-status').textContent).toMatch(/Aceptada por el SII · TrackId 24416614851/);
    expect(screen.queryByRole('button', { name: 'Emitir boleta electrónica' })).toBeNull();
  });
});
