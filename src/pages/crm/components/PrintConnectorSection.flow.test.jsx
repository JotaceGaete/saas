// Flujo real de la tarjeta del conector: hook + PrintConnectorSection + botón «Verificar conector».
// fetch simulado a nivel de red (sin CORS real). Ejecutar desde el scratch con vitest.
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePrintConnector } from './usePrintConnector';
import PrintConnectorSection from './PrintConnectorSection';

vi.mock('components/AppIcon', () => ({ default: () => null }));

const BIZ = 'biz-1';
const TOKEN = 'a'.repeat(43);
const KEY = `walinka:print-connector:${BIZ}`;

function Harness({ businessId }) {
  const connector = usePrintConnector(businessId);
  return <PrintConnectorSection connector={connector} />;
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const healthOk = () => json(200, { service: 'walinka-print-connector', apiVersion: '1', version: '0.3.0' });
const networkFail = () => Promise.reject(new TypeError('Failed to fetch'));

const urlOf = (u) => String(u);
const calls = (fetchMock, suffix) => fetchMock.mock.calls.filter(([u]) => urlOf(u).endsWith(suffix));

let fetchMock;
let printersMode;
beforeEach(() => {
  localStorage.clear();
  printersMode = 'ok';
  fetchMock = vi.fn(async (url) => {
    const u = urlOf(url);
    if (u.endsWith('/v1/health')) return healthOk();
    if (u.endsWith('/v1/printers')) {
      if (printersMode === 'network') return networkFail();
      return json(200, { printers: [{ name: 'XP-80C', isDefault: true, problems: [] }] });
    }
    return json(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('comercio SIN token', () => {
  it('health 200: la tarjeta refleja que el conector responde', async () => {
    render(<Harness businessId={BIZ} />);
    await waitFor(() => expect(calls(fetchMock, '/v1/health').length).toBeGreaterThan(0));
    expect(await screen.findByText(/conector detectado/i)).toBeTruthy();
  });

  it('«Verificar conector» produce una solicitud a /v1/health y feedback visible', async () => {
    render(<Harness businessId={BIZ} />);
    await waitFor(() => expect(calls(fetchMock, '/v1/health').length).toBeGreaterThan(0));
    const before = calls(fetchMock, '/v1/health').length;
    fireEvent.click(screen.getByRole('button', { name: /verificar conector/i }));
    await waitFor(() => expect(calls(fetchMock, '/v1/health').length).toBeGreaterThan(before));
    expect(calls(fetchMock, '/v1/printers').length).toBe(0);
    expect(await screen.findByText(/conector respondió|conector detectado/i)).toBeTruthy();
  });
});

describe('comercio CON token', () => {
  const seed = (extra = {}) => localStorage.setItem(KEY, JSON.stringify({
    schemaVersion: 1, enabled: true, baseUrl: 'http://127.0.0.1:47801', token: TOKEN, printerName: 'XP-80C', deviceName: 'Caja', ...extra,
  }));

  it('listado correcto: conectado y con impresora', async () => {
    seed();
    render(<Harness businessId={BIZ} />);
    expect(await screen.findByText('Conectado')).toBeTruthy();
    const pr = calls(fetchMock, '/v1/printers');
    expect(pr.length).toBeGreaterThan(0);
    expect(pr[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('listado falla por red: health 200 se refleja, no «no encontrado»', async () => {
    printersMode = 'network';
    seed();
    render(<Harness businessId={BIZ} />);
    expect(await screen.findByText(/sin lista de impresoras/i)).toBeTruthy();
    expect(screen.queryByText(/no se encontró el conector/i)).toBeNull();
  });

  it('«Verificar conector» vuelve a consultar health y listado', async () => {
    seed();
    render(<Harness businessId={BIZ} />);
    await screen.findByText('Conectado');
    const h = calls(fetchMock, '/v1/health').length;
    const p = calls(fetchMock, '/v1/printers').length;
    fireEvent.click(screen.getByRole('button', { name: /verificar conector/i }));
    await waitFor(() => expect(calls(fetchMock, '/v1/health').length).toBeGreaterThan(h));
    await waitFor(() => expect(calls(fetchMock, '/v1/printers').length).toBeGreaterThan(p));
  });
});

describe('Preview no autorizada', () => {
  it('«Autorizar este sitio» pide confirmación al conector y espera a que la acepte', async () => {
    let approved = false;
    fetchMock.mockImplementation(async (url, init = {}) => {
      const u = urlOf(url);
      if (u.endsWith('/v1/origin-approval')) {
        // El usuario pulsa «Sí» en Windows.
        approved = true;
        return new Response(null, { status: 202 });
      }
      if (u.endsWith('/v1/health')) {
        if (init.mode === 'no-cors') return new Response(null, { status: 200 });
        return approved ? healthOk() : networkFail(); // CORS bloquea hasta que se autoriza.
      }
      return json(404, {});
    });

    render(<Harness businessId={BIZ} />);
    const button = await screen.findByRole('button', { name: /autorizar este sitio/i });
    fireEvent.click(button);

    expect(await screen.findByText(/pulsa «sí» en esa ventana/i)).toBeTruthy();
    const approvals = calls(fetchMock, '/v1/origin-approval');
    expect(approvals.length).toBe(1);
    expect(approvals[0][1]).toMatchObject({ method: 'POST', mode: 'no-cors', credentials: 'omit' });
    expect(approvals[0][1].headers).toBeUndefined();

    expect(await screen.findByText(/sitio autorizado/i, {}, { timeout: 6000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /autorizar este sitio/i })).toBeNull();
  }, 10000);
});
