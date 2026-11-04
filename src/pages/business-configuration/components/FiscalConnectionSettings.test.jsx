import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getFiscalConnection: vi.fn(),
  submitFiscalApplication: vi.fn(),
  disconnectFiscal: vi.fn(),
}));
vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('../../../services/fiscalConnectionService', () => ({
  ...svc,
  describeFiscalError: (e) => `error:${e?.code ?? 'x'}`,
}));

const { default: FiscalConnectionSettings } = await import('./FiscalConnectionSettings');

const BIZ = 'biz-1';
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';
const base = {
  connected: false, issuerRut: null, enabled: false, verified: false, reviewStatus: 'draft', reviewNote: null,
  resolucionNumero: null, resolucionFecha: null, sucursalNombre: null, sucursalCodigo: null, submittedAt: null,
};

beforeEach(() => { Object.values(svc).forEach((f) => f.mockReset()); });
afterEach(() => cleanup());

describe('alta de facturación del comercio', () => {
  it('sin cuenta: un solo formulario; enviar manda RUT, clave y resolución y deja «en revisión»', async () => {
    svc.getFiscalConnection.mockResolvedValue(base);
    svc.submitFiscalApplication.mockResolvedValue({
      ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'pending_review',
      resolucionNumero: 80, resolucionFecha: '2014-08-22', submittedAt: '2026-11-04T12:00:00Z',
    });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    await screen.findByTestId('fiscal-form');
    const send = screen.getByRole('button', { name: 'Enviar a revisión' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('RUT de tu negocio'), { target: { value: '12.345.678-5' } });
    fireEvent.change(screen.getByLabelText('API key de DTE Core'), { target: { value: API_KEY } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '80a' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2014-08-22' } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    await screen.findByTestId('fiscal-status-pending');
    expect(svc.submitFiscalApplication).toHaveBeenCalledWith(BIZ, expect.objectContaining({
      issuerRut: '12.345.678-5', apiKey: API_KEY, resolucionNumero: '80', resolucionFecha: '2014-08-22', sucursalNombre: '', sucursalCodigo: '',
    }));
    // La clave no queda en ningún campo después de enviar.
    expect(document.body.innerHTML.includes(API_KEY)).toBe(false);
    expect(screen.getByTestId('fiscal-summary')).toHaveTextContent('guardada de forma segura');
  });

  it('rechazada: muestra el motivo y permite reenviar sin volver a pegar la clave', async () => {
    svc.getFiscalConnection.mockResolvedValue({
      ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'rejected', reviewNote: 'La resolución no coincide',
      resolucionNumero: 8, resolucionFecha: '2014-08-22',
    });
    svc.submitFiscalApplication.mockResolvedValue({ ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'pending_review', resolucionNumero: 80, resolucionFecha: '2014-08-22' });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    expect(await screen.findByTestId('fiscal-status-rejected')).toHaveTextContent('La resolución no coincide');
    expect(screen.getByLabelText('API key de DTE Core')).toHaveAttribute('placeholder', expect.stringMatching(/Ya está guardada/));
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revisión' }));
    await waitFor(() => expect(svc.submitFiscalApplication).toHaveBeenCalled());
    expect(svc.submitFiscalApplication.mock.calls[0][1].apiKey).toBe('');
  });

  it('aprobada: muestra «Listo» y el resumen; cambiar datos avisa que vuelve a revisión', async () => {
    svc.getFiscalConnection.mockResolvedValue({
      ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'approved', enabled: true, verified: true,
      resolucionNumero: 80, resolucionFecha: '2014-08-22',
    });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    expect(await screen.findByTestId('fiscal-status-approved')).toBeInTheDocument();
    expect(screen.queryByTestId('fiscal-form')).toBeNull();
    expect(screen.getByTestId('fiscal-summary')).toHaveTextContent('Walinka volverá a revisarlos');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar datos' }));
    expect(screen.getByTestId('fiscal-form')).toBeInTheDocument();
  });

  it('suspendida: muestra el motivo', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'suspended', reviewNote: 'Reclamos del SII', resolucionNumero: 80, resolucionFecha: '2014-08-22' });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    expect(await screen.findByTestId('fiscal-status-suspended')).toHaveTextContent('Reclamos del SII');
  });

  it('error al enviar: muestra el mensaje y no deja la clave en el campo', async () => {
    svc.getFiscalConnection.mockResolvedValue(base);
    svc.submitFiscalApplication.mockRejectedValue({ code: 'INVALID_RESOLUCION' });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    await screen.findByTestId('fiscal-form');
    fireEvent.change(screen.getByLabelText('RUT de tu negocio'), { target: { value: '12.345.678-5' } });
    fireEvent.change(screen.getByLabelText('API key de DTE Core'), { target: { value: API_KEY } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2014-08-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revisión' }));
    expect(await screen.findByText('error:INVALID_RESOLUCION')).toBeInTheDocument();
    expect(screen.getByLabelText('API key de DTE Core')).toHaveValue('');
  });
});
