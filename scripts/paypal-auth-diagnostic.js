import { getAccessToken } from '../backend/src/services/paypal/authService.js';
import { getPaypalMode } from '../backend/src/config/paypal/index.js';
import { getEnv } from '../backend/src/config/env.js';

async function run() {
  try {
    const env = getEnv();
    console.log('[env-check]');
    console.log(`mode: ${env.paypal.mode}`);
    console.log(`client_id_present: ${env.paypal.clientId ? 'yes' : 'no'}`);
    console.log(`client_secret_present: ${env.paypal.clientSecret ? 'yes' : 'no'}`);
    console.log('');

    const result = await getAccessToken();
    const mode = getPaypalMode();
    const tokenLength = String(result?.accessToken || '').length;
    const expiresIn = Number(result?.expiresIn || 0);

    console.log('autenticacion_exitosa: si');
    console.log(`longitud_token: ${tokenLength}`);
    console.log(`segundos_expiracion: ${expiresIn}`);
    console.log(`modo_actual: ${mode}`);
  } catch (_err) {
    console.log('autenticacion_exitosa: no');
    process.exitCode = 1;
  }
}

run();

