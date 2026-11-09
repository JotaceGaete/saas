// Arranque con dos claves maestras: el diagnóstico informa solo estados (nunca valores ni KCV) y una
// V2 mal configurada no impide servir la V1 ni se usa.
import { strictEqual as assertEquals, deepStrictEqual, ok as assert, throws } from 'node:assert';
import { buildFiscalHandler, describeFiscalEnv, describeMasterKeys, type FiscalDbClient } from '../../app.ts';
import { createDtecoreBlockedProvider } from '../../lib/providers/dtecore-blocked.mjs';
import { keyCheckValue } from '../../lib/secrets.mjs';
import { Buffer } from 'node:buffer';

const V1 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const V2 = Buffer.alloc(32, 7).toString('base64');
const V2_KCV = keyCheckValue(Buffer.from(V2, 'base64'));
const env = (o: Record<string, string>) => (n: string) => o[n];
const db = { rpc: async () => ({ data: null, error: null }), from: () => ({}), auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as unknown as FiscalDbClient;

Deno.test('describeMasterKeys: estados de V1 y V2 para cada configuración', () => {
  deepStrictEqual(describeMasterKeys(env({})), { v1: 'missing', v2: 'missing' });
  deepStrictEqual(describeMasterKeys(env({ FISCAL_MASTER_KEY: 'sk_live_no_es_base64_de_32' })), { v1: 'invalid', v2: 'missing' });
  deepStrictEqual(describeMasterKeys(env({ FISCAL_MASTER_KEY: V1, FISCAL_MASTER_KEY_V2: V2 })), { v1: 'ok', v2: 'kcv_missing' });
  deepStrictEqual(describeMasterKeys(env({ FISCAL_MASTER_KEY: V1, FISCAL_MASTER_KEY_V2: V2, FISCAL_MASTER_KEY_V2_KCV: '0'.repeat(32) })), { v1: 'ok', v2: 'kcv_mismatch' });
  deepStrictEqual(describeMasterKeys(env({ FISCAL_MASTER_KEY: V1, FISCAL_MASTER_KEY_V2: V1, FISCAL_MASTER_KEY_V2_KCV: keyCheckValue(Buffer.from(V1, 'base64')) })), { v1: 'ok', v2: 'same_as_v1' });
  deepStrictEqual(describeMasterKeys(env({ FISCAL_MASTER_KEY: V1, FISCAL_MASTER_KEY_V2: V2, FISCAL_MASTER_KEY_V2_KCV: V2_KCV })), { v1: 'ok', v2: 'ok' });
});

Deno.test('el registro de arranque no contiene ninguna clave ni KCV', () => {
  const all = { SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's', FISCAL_ALLOWED_ISSUERS: 'a', FISCAL_MASTER_KEY: V1, FISCAL_MASTER_KEY_V2: V2, FISCAL_MASTER_KEY_V2_KCV: V2_KCV, FISCAL_PROVIDER: 'dtecore' };
  const text = JSON.stringify(describeFiscalEnv(env(all)));
  for (const secret of [V1, V2, V2_KCV, Buffer.from(V1, 'base64').toString('hex'), Buffer.from(V2, 'base64').toString('hex')]) assert(!text.includes(secret));
  assert(text.includes('"masterKeys":{"v1":"ok","v2":"ok"}'));
});

Deno.test('manejador: V1 obligatoria; V2 inválida o sin KCV no impide construirlo', () => {
  const provider = createDtecoreBlockedProvider();
  throws(() => buildFiscalHandler({ db, provider, masterKey: undefined, masterKeyV2: V2, masterKeyV2Kcv: V2_KCV }), /MASTER_KEY_MISSING/);
  for (const extra of [{}, { masterKeyV2: V2 }, { masterKeyV2: 'basura' , masterKeyV2Kcv: V2_KCV }, { masterKeyV2: V2, masterKeyV2Kcv: V2_KCV }]) {
    assertEquals(typeof buildFiscalHandler({ db, provider, masterKey: V1, ...extra }), 'function');
  }
});
