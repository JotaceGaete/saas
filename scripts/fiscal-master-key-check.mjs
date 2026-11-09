#!/usr/bin/env node
// Calcula, SIN mostrar la clave, los dos valores para verificar FISCAL_MASTER_KEY_V2:
//   - sha256: huella del texto exacto de la clave; compárala con la que muestra Supabase
//     (Edge Functions → Secrets) para FISCAL_MASTER_KEY_V2.
//   - kcv: valor de comprobación que va en FISCAL_MASTER_KEY_V2_KCV, igual en Vercel y en Supabase.
//     Cada plataforma usa la clave V2 solo si su propio cálculo coincide con este valor.
// Ninguno de los dos permite recuperar la clave.
//
// Uso (la clave se lee de la entrada, sin eco, y no queda en el historial del terminal):
//   node scripts/fiscal-master-key-check.mjs
// o desde el portapapeles, p. ej. en macOS:  pbpaste | node scripts/fiscal-master-key-check.mjs
import { createHash } from 'node:crypto';
import { keyCheckValue, parseMasterKey } from '../supabase/functions/fiscal-emit/lib/secrets.mjs';

async function readSecret() {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += chunk;
    return data.trim();
  }
  stderr.write('Pega la clave y presiona Enter (no se mostrará): ');
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    let value = '';
    stdin.on('data', (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stderr.write('\n');
          resolve(value.trim());
          return;
        }
        if (ch === '\u0003') process.exit(130);
        value += ch;
      }
    });
  });
}

const secret = await readSecret();
let key;
try {
  key = parseMasterKey(secret);
} catch {
  console.error('Clave inválida: debe ser base64 de exactamente 32 bytes (openssl rand -base64 32).');
  process.exit(1);
}
console.log(`sha256: ${createHash('sha256').update(secret, 'utf8').digest('hex')}`);
console.log(`kcv:    ${keyCheckValue(key)}`);
