import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
// Vite `?raw`: contenido crudo del componente, para la comprobación
// estructural de "nunca lee mp_connections directamente" al final.
import mercadoPagoConnectSource from './MercadoPagoConnect.jsx?raw';

vi.mock('../../../services/mpConnectionService', () => ({
  getMercadoPagoConnectionStatus: vi.fn(),
  startMercadoPagoOAuth: vi.fn(),
  disconnectMercadoPago: vi.fn(),
  fetchMercadoPagoPointTerminals: vi.fn(),
}));

import {
  getMercadoPagoConnectionStatus,
  startMercadoPagoOAuth,
  disconnectMercadoPago,
  fetchMercadoPagoPointTerminals,
} from '../../../services/mpConnectionService';
import MercadoPagoConnect from './MercadoPagoConnect';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MercadoPagoConnect — estado desconectado', () => {
  it('muestra "No conectado" y el botón "Conectar Mercado Pago"', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: { connected: false, status: 'disconnected' }, error: null });

    render(<MercadoPagoConnect />);

    await waitFor(() => expect(screen.getByText('No conectado')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Conectar Mercado Pago/i })).toBeInTheDocument();
    expect(screen.queryByText('Conectado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desconectar/i })).not.toBeInTheDocument();
  });

  it('al hacer clic en Conectar, llama a startMercadoPagoOAuth (que navega el browser)', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: { connected: false, status: 'disconnected' }, error: null });
    startMercadoPagoOAuth.mockResolvedValue({ error: null });

    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Conectar Mercado Pago/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Conectar Mercado Pago/i }));

    await waitFor(() => expect(startMercadoPagoOAuth).toHaveBeenCalledTimes(1));
  });

  it('si startMercadoPagoOAuth falla, muestra un banner de error', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: { connected: false, status: 'disconnected' }, error: null });
    startMercadoPagoOAuth.mockResolvedValue({ error: new Error('boom') });

    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Conectar Mercado Pago/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Conectar Mercado Pago/i }));

    await waitFor(() => expect(screen.getByText(/No se pudo iniciar la conexión/i)).toBeInTheDocument());
  });
});

describe('MercadoPagoConnect — estado conectado', () => {
  it('muestra "Conectado" y el botón "Desconectar"', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({
      data: { connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z', liveMode: true },
      error: null,
    });

    render(<MercadoPagoConnect />);

    await waitFor(() => expect(screen.getByText('Conectado')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Desconectar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conectar Mercado Pago/i })).not.toBeInTheDocument();
  });

  it('muestra providerUserId y la fecha de conexión, nunca tokens/scope/credenciales', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({
      data: { connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z', liveMode: true },
      error: null,
    });

    render(<MercadoPagoConnect />);

    await waitFor(() => expect(screen.getByText('123456')).toBeInTheDocument());
    expect(screen.queryByText(/access_token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh_token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/client_secret/i)).not.toBeInTheDocument();
  });

  it('desconectar requiere confirmación de dos pasos: el primer clic pide confirmar, no llama al servicio', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({
      data: { connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z' },
      error: null,
    });

    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Desconectar/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Desconectar/i }));

    expect(await screen.findByText('¿Confirmar desconexión?')).toBeInTheDocument();
    expect(disconnectMercadoPago).not.toHaveBeenCalled();
  });

  it('desconectar: el segundo clic (confirmar) sí llama al servicio y vuelve a "No conectado"', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({
      data: { connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z' },
      error: null,
    });
    disconnectMercadoPago.mockResolvedValue({ data: { connected: false }, error: null });

    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Desconectar/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Desconectar/i }));
    await screen.findByText('¿Confirmar desconexión?');

    fireEvent.click(screen.getByRole('button', { name: /Sí, desconectar/i }));

    await waitFor(() => expect(disconnectMercadoPago).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('No conectado')).toBeInTheDocument());
  });

  it('cancelar la confirmación no desconecta y mantiene "Conectado"', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({
      data: { connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z' },
      error: null,
    });

    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Desconectar/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Desconectar/i }));
    await screen.findByText('¿Confirmar desconexión?');

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));

    expect(screen.queryByText('¿Confirmar desconexión?')).not.toBeInTheDocument();
    expect(disconnectMercadoPago).not.toHaveBeenCalled();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });
});

describe('MercadoPagoConnect — carga y errores', () => {
  it('muestra un spinner mientras carga el estado', () => {
    getMercadoPagoConnectionStatus.mockReturnValue(new Promise(() => {})); // nunca resuelve
    const { container } = render(<MercadoPagoConnect />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('si la RPC de estado falla, muestra un banner de error', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByText(/No se pudo obtener el estado/i)).toBeInTheDocument());
  });
});

describe('MercadoPagoConnect — MP-POINT-0: sección Terminales Point', () => {
  const connectedStatus = {
    connected: true, status: 'connected', providerUserId: '123456', connectedAt: '2026-09-07T00:00:00Z',
  };

  it('no muestra la sección de Terminales Point si Mercado Pago no está conectado', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: { connected: false, status: 'disconnected' }, error: null });
    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByText('No conectado')).toBeInTheDocument());
    expect(screen.queryByText('Terminales Point')).not.toBeInTheDocument();
  });

  it('conectado, muestra la sección con el botón "Buscar terminales"', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    render(<MercadoPagoConnect />);
    await waitFor(() => expect(screen.getByText('Terminales Point')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Buscar terminales/i })).toBeInTheDocument();
  });

  it('lista vacía: muestra "sin terminales" y ninguna tabla', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    fetchMercadoPagoPointTerminals.mockResolvedValue({ data: { terminals: [], total: 0 }, error: null });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));

    await waitFor(() => expect(screen.getByText(/no tiene terminales Point registradas/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('una terminal STANDALONE: muestra los 5 campos seguros en la tabla', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    fetchMercadoPagoPointTerminals.mockResolvedValue({
      data: {
        terminals: [{ id: 'STANDALONE_TERM_1', posId: null, storeId: null, externalPosId: null, operatingMode: 'STANDALONE' }],
        total: 1,
      },
      error: null,
    });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));

    expect(await screen.findByText('STANDALONE_TERM_1')).toBeInTheDocument();
    expect(screen.getByText('STANDALONE')).toBeInTheDocument();
  });

  it('una terminal PDV con store_id/pos_id/external_pos_id', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    fetchMercadoPagoPointTerminals.mockResolvedValue({
      data: {
        terminals: [{ id: 'PAX_A910__SMARTPOS123', posId: '111', storeId: '222', externalPosId: 'CAJA1', operatingMode: 'PDV' }],
        total: 1,
      },
      error: null,
    });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));

    expect(await screen.findByText('PAX_A910__SMARTPOS123')).toBeInTheDocument();
    expect(screen.getByText('PDV')).toBeInTheDocument();
    expect(screen.getByText('CAJA1')).toBeInTheDocument();
  });

  it('token inválido/vencido muestra un mensaje comprensible (MP_CONNECTION_EXPIRED)', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    const err = new Error('boom'); err.reason = 'MP_CONNECTION_EXPIRED';
    fetchMercadoPagoPointTerminals.mockResolvedValue({ data: null, error: err });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));

    expect(await screen.findByText(/La conexión de Mercado Pago expiró/i)).toBeInTheDocument();
  });

  it('error de API de Mercado Pago (MP_UNEXPECTED_ERROR) muestra un mensaje comprensible, no el error crudo', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    const err = new Error('some raw technical message'); err.reason = 'MP_UNEXPECTED_ERROR';
    fetchMercadoPagoPointTerminals.mockResolvedValue({ data: null, error: err });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));

    expect(await screen.findByText(/error inesperado/i)).toBeInTheDocument();
    expect(screen.queryByText('some raw technical message')).not.toBeInTheDocument();
  });

  it('no permite cambiar operating_mode -- no hay ningún control editable en la tabla', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    fetchMercadoPagoPointTerminals.mockResolvedValue({
      data: { terminals: [{ id: 'T1', posId: '1', storeId: '1', externalPosId: 'X', operatingMode: 'PDV' }], total: 1 },
      error: null,
    });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));
    await screen.findByText('T1');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PDV|STANDALONE|UNDEFINED|cambiar/i })).not.toBeInTheDocument();
  });

  it('nunca muestra el access_token ni ningún dato sensible en la sección de terminales', async () => {
    getMercadoPagoConnectionStatus.mockResolvedValue({ data: connectedStatus, error: null });
    fetchMercadoPagoPointTerminals.mockResolvedValue({
      data: { terminals: [{ id: 'T1', posId: '1', storeId: '1', externalPosId: 'X', operatingMode: 'PDV' }], total: 1 },
      error: null,
    });

    render(<MercadoPagoConnect />);
    fireEvent.click(await screen.findByRole('button', { name: /Buscar terminales/i }));
    await screen.findByText('T1');

    expect(screen.queryByText(/access_token/i)).not.toBeInTheDocument();
  });
});

describe('acceso directo a la tabla mp_connections', () => {
  it('el código fuente de este componente NUNCA hace supabase.from(\'mp_connections\')', () => {
    expect(mercadoPagoConnectSource).not.toMatch(/\.from\(\s*['"]mp_connections['"]/);
    expect(mercadoPagoConnectSource).not.toContain('supabase');
  });
});
