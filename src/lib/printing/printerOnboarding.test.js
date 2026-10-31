import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPrinterSetupError, getPrinterSetupSteps } from './printerOnboarding.js';

test('QZ trust is not confused with a valid signature', () => {
  assert.equal(explainPrinterSetupError(new Error('Untrusted website')).code, 'TRUST_REQUIRED');
  assert.equal(explainPrinterSetupError(new Error('Failed to sign request')).code, 'SIGNING_FAILED');
});
test('missing central certificate is a Walinka configuration issue', () => {
  const result = explainPrinterSetupError(new Error('Certificado QZ no configurado (VITE_QZ_CERTIFICATE)'));
  assert.equal(result.code, 'CERTIFICATE_MISSING');
  assert.match(result.action, /soporte/i);
});
test('disconnected QZ has a local startup action', () => {
  assert.equal(explainPrinterSetupError(new Error('WebSocket connection refused')).code, 'QZ_UNAVAILABLE');
});
test('setup is non-transactional and does not promise silent demo trust', () => {
  const steps = getPrinterSetupSteps();
  assert.deepEqual(steps.map(x => x.id), ['qz','trust','printer','test']);
  assert.match(steps[1].detail, /no garantiza confianza automática/i);
});
