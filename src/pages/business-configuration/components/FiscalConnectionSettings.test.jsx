import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getFiscalConnection: vi.fn(),
  submitFiscalApplication: vi.fn(),
  setFiscalTaxDefault: vi.fn(),
  disconnectFiscal: vi.fn(),
  confirmFiscalRut: vi.fn(),
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

describe('IVA por defecto del negocio', () => {
  it('conectado: elegir «todo afecto» guarda la categoría', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'approved', enabled: true, verified: true, resolucionNumero: 80, resolucionFecha: '2014-08-22', defaultTaxCategory: null });
    svc.setFiscalTaxDefault.mockResolvedValue({ ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'approved', defaultTaxCategory: 'IVA_AFECTO_19', resolucionNumero: 80, resolucionFecha: '2014-08-22' });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    const select = await screen.findByLabelText('IVA de tus productos');
    expect(select).toHaveValue('');
    expect(screen.getByText(/Sin IVA por defecto/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'IVA_AFECTO_19' } });
    await waitFor(() => expect(svc.setFiscalTaxDefault).toHaveBeenCalledWith(BIZ, 'IVA_AFECTO_19'));
    await waitFor(() => expect(screen.getByLabelText('IVA de tus productos')).toHaveValue('IVA_AFECTO_19'));
  });

  it('sin cuenta conectada la sección no aparece', async () => {
    svc.getFiscalConnection.mockResolvedValue(base);
    render(<FiscalConnectionSettings businessId={BIZ} />);
    await screen.findByTestId('fiscal-form');
    expect(screen.queryByTestId('fiscal-tax-default')).toBeNull();
  });
});

describe('empresas autorizadas (servidor)', () => {
  it('negocio fuera de la lista: no se muestra el formulario ni se puede enviar nada', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...base, allowed: false });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    await screen.findByTestId('fiscal-not-available');
    expect(screen.queryByTestId('fiscal-form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar a revisión' })).toBeNull();
    expect(svc.submitFiscalApplication).not.toHaveBeenCalled();
  });

  it('negocio de la lista: formulario normal', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...base, allowed: true });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    await screen.findByTestId('fiscal-form');
    expect(screen.queryByTestId('fiscal-not-available')).toBeNull();
  });
});

describe('confirmación del RUT antes de la primera boleta (migración H)', () => {
  const linked = { ...base, connected: true, issuerRut: '12345678-5', reviewStatus: 'approved', verified: true, enabled: true,
    resolucionNumero: 80, resolucionFecha: '2014-08-22' };

  it('sin confirmar: muestra el RUT y exige marcar la casilla antes de confirmar', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...linked, rutConfirmed: false, rutConfirmationReason: 'not_confirmed' });
    svc.confirmFiscalRut.mockResolvedValue({ ...linked, rutConfirmed: true, rutConfirmationReason: null });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    expect(await screen.findByTestId('fiscal-rut-to-confirm')).toHaveTextContent('12345678-5');
    const btn = screen.getByTestId('fiscal-rut-confirm');
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByTestId('fiscal-rut-ack'));
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByTestId('fiscal-rut-confirmation')).toHaveAttribute('data-confirmed', 'true'));
    expect(svc.confirmFiscalRut).toHaveBeenCalledWith(BIZ, '12345678-5');
  });

  it('confirmado: solo informa el RUT, sin volver a pedir confirmación', async () => {
    svc.getFiscalConnection.mockResolvedValue({ ...linked, rutConfirmed: true, rutConfirmationReason: null });
    render(<FiscalConnectionSettings businessId={BIZ} />);
    expect(await screen.findByTestId('fiscal-rut-confirmed')).toHaveTextContent('12345678-5');
    expect(screen.queryByTestId('fiscal-rut-confirm')).toBeNull();
  });
});
