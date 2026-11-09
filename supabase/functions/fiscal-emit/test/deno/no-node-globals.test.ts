// Regresión de la v1 en producción: "ReferenceError: Buffer is not defined" en parseMasterKey.
// El Deno local expone Buffer como global y el runtime de Supabase Edge no. Estas pruebas quitan el
// global y ejercitan el código que lo usa; además exigen el import explícito en el grafo desplegable.
import { strictEqual as assertEquals, ok as assert, deepStrictEqual } from 'node:assert';

const SAVED = (globalThis as any).Buffer;

Deno.test('sin Buffer global: clave maestra, cifrado, descifrado y credencial de la base funcionan', async () => {
  delete (globalThis as any).Buffer;
  try {
    assertEquals(typeof (globalThis as any).Buffer, 'undefined');
    const { parseMasterKey, seal, open } = await import('../../lib/secrets.mjs');
    const { mapCredentialRecord } = await import('../../lib/store-common.mjs');
    const key = parseMasterKey('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=');
    assertEquals(key.length, 32);
    const biz = '11111111-1111-4111-8111-111111111111';
    const sealed = seal({ apiKey: 'k' }, { key, businessId: biz });
    const asRow = {
      provider: sealed.provider, key_version: sealed.keyVersion,
      ciphertext: sealed.ciphertext.toString('base64'), iv: sealed.iv.toString('base64'), auth_tag: sealed.authTag.toString('base64'),
    };
    deepStrictEqual(open(mapCredentialRecord(asRow), { key, businessId: biz }), { apiKey: 'k' });
  } finally {
    (globalThis as any).Buffer = SAVED;
  }
});

Deno.test('todo archivo desplegable que usa Buffer lo importa de node:buffer', async () => {
  const root = new URL('../../', import.meta.url);
  const cmd = new Deno.Command(Deno.execPath(), { args: ['info', '--node-modules-dir=none', '--json', 'index.ts'], cwd: root });
  const graph = JSON.parse(new TextDecoder().decode((await cmd.output()).stdout));
  const files = graph.modules.map((m: any) => m.specifier).filter((s: string) => s.startsWith('file:'));
  assert(files.length >= 18);
  const offenders: string[] = [];
  for (const f of files) {
    const src = await Deno.readTextFile(new URL(f));
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    if (/\bBuffer\b/.test(code) && !/import\s*\{[^}]*\bBuffer\b[^}]*\}\s*from\s*'node:buffer'/.test(code)) offenders.push(f);
  }
  deepStrictEqual(offenders, []);
});
