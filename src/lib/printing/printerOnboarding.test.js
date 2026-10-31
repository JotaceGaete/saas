import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPrinterSetupError, getPrinterSetupSteps } from './printerOnboarding.js';

// Messages below are copied from the real throw sites in
// providers/qzTrayProvider.js and from QZ Tray's generic rejection.
const code = (message) => explainPrinterSetupError(new Error(message)).code;

test('QZ generic "Failed to sign request" is NOT classified as a trust problem', () => {
  assert.equal(code('Failed to sign request'), 'SIGNATURE_UNCONFIRMED');
  assert.notEqual(code('Failed to sign request'), 'TRUST_REQUIRED');
});

test('explicit untrusted wording from QZ maps to TRUST_REQUIRED', () => {
  assert.equal(code('Untrusted website'), 'TRUST_REQUIRED');
  // Denial wording below is a plausible QZ message, not verified against QZ 2.3.x.
  assert.equal(code('Request has been denied by the user'), 'TRUST_REQUIRED');
});

test('provider config errors map to CONFIG_MISSING, even when they mention "Untrusted website"', () => {
  // qzTrayProvider.getQzCertificate(): the message itself says "Untrusted website".
  const r = explainPrinterSetupError(new Error('Certificado QZ no configurado (VITE_QZ_CERTIFICATE). Sin esto, QZ Tray mostrará "Untrusted website".'));
  assert.equal(r.code, 'CONFIG_MISSING');
  assert.match(r.action, /soporte/i);
  assert.equal(code('Falta configurar la clave pública de Supabase (VITE_SUPABASE_PUBLISHABLE_KEY).'), 'CONFIG_MISSING');
  assert.equal(code('Falta configurar VITE_SUPABASE_URL para firmar solicitudes QZ.'), 'CONFIG_MISSING');
});

test('missing session maps to SESSION_REQUIRED and does not use the signing wording', () => {
  assert.equal(code('No hay una sesión válida para firmar la solicitud QZ. Inicia sesión de nuevo.'), 'SESSION_REQUIRED');
  assert.equal(code('No autorizado'), 'SESSION_REQUIRED'); // qz-sign 401 body
});

test('no HTTP response from qz-sign maps to NETWORK_ERROR', () => {
  assert.equal(code('No se pudo contactar el servicio de firma QZ (endpoint no disponible).'), 'NETWORK_ERROR');
});

test('qz-sign server-side answers map to SIGNING_SERVICE_ERROR', () => {
  assert.equal(code('El servicio de firma QZ devolvió una respuesta inválida.'), 'SIGNING_SERVICE_ERROR');
  assert.equal(code('El servicio de firma QZ devolvió una firma inválida.'), 'SIGNING_SERVICE_ERROR');
  assert.equal(code('El servicio de firma QZ respondió con error (500).'), 'SIGNING_SERVICE_ERROR');
  assert.equal(code('Servicio de firma no configurado'), 'SIGNING_SERVICE_ERROR');
  assert.equal(code('No se pudo firmar la solicitud'), 'SIGNING_SERVICE_ERROR');
  assert.equal(code('Origen no permitido'), 'SIGNING_SERVICE_ERROR');
});

test('QZ Tray not running maps to QZ_UNAVAILABLE', () => {
  assert.equal(code('WebSocket connection refused'), 'QZ_UNAVAILABLE');
  assert.equal(code('connect ECONNREFUSED 127.0.0.1:8181'), 'QZ_UNAVAILABLE');
});

test('missing printer selection maps to PRINTER_NOT_SELECTED', () => {
  assert.equal(code('Selecciona una impresora antes de imprimir.'), 'PRINTER_NOT_SELECTED');
});

test('unknown errors fall back to PRINTER_ERROR without asking to re-login', () => {
  const r = explainPrinterSetupError(new Error('algo inesperado'));
  assert.equal(r.code, 'PRINTER_ERROR');
  assert.doesNotMatch(r.action, /inicia sesión|vuelve a iniciar/i);
});

test('setup is non-transactional and does not promise silent demo trust', () => {
  const steps = getPrinterSetupSteps();
  assert.deepEqual(steps.map(x => x.id), ['qz', 'trust', 'printer', 'test']);
  assert.match(steps[1].detail, /no garantiza confianza automática/i);
});
