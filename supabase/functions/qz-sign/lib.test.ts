/**
 * qz-sign — batería de tests unitarios.
 * Ejecutar: npx vitest run supabase/functions/qz-sign/lib.test.ts
 *
 * lib.ts no referencia `Deno` a nivel de módulo (mismo criterio que
 * _shared/supabaseAdminKey.ts), así que se testea con datos reales,
 * incluida la firma/verificación con un keypair RSA generado en el propio
 * test (nunca un secreto real, nunca committeado).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  QZ_SIGNATURE_ALGORITHM,
  isAllowedOrigin,
  buildCorsHeaders,
  extractSignPayload,
  signWithPrivateKey,
  QzSignError,
} from './lib';

function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const base64 = Buffer.from(buffer).toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/** Keypair RSA efímero SOLO para este archivo de test -- nunca es un secreto real. */
async function generateTestKeyPair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-512' },
    true,
    ['sign', 'verify'],
  );
  const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  const publicSpki = await crypto.subtle.exportKey('spki', publicKey);
  return {
    privateKeyPem: arrayBufferToPem(privatePkcs8, 'PRIVATE KEY'),
    publicKey,
    publicKeyBuffer: publicSpki,
  };
}

describe('QZ_SIGNATURE_ALGORITHM', () => {
  it('es "SHA512" -- el valor exacto que el frontend pasa a qz.security.setSignatureAlgorithm', () => {
    expect(QZ_SIGNATURE_ALGORITHM).toBe('SHA512');
  });
});

describe('isAllowedOrigin / buildCorsHeaders', () => {
  it('permite los dominios conocidos de Walinka/Ventalink', () => {
    expect(isAllowedOrigin('https://go.ventalink.app')).toBe(true);
    expect(isAllowedOrigin('https://walinka.com')).toBe(true);
    expect(isAllowedOrigin('http://localhost:4028')).toBe(true);
  });

  it('permite previews *.vercel.app', () => {
    expect(isAllowedOrigin('https://mi-preview-123.vercel.app')).toBe(true);
  });

  it('rechaza null, vacío y dominios no reconocidos', () => {
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
    expect(isAllowedOrigin('not-a-url')).toBe(false);
  });

  it('buildCorsHeaders refleja el origin permitido, o cae a go.ventalink.app si no lo es', () => {
    expect(buildCorsHeaders('https://walinka.com')['Access-Control-Allow-Origin']).toBe('https://walinka.com');
    expect(buildCorsHeaders('https://evil.example.com')['Access-Control-Allow-Origin']).toBe('https://go.ventalink.app');
    expect(buildCorsHeaders(null)['Access-Control-Allow-Origin']).toBe('https://go.ventalink.app');
  });
});

describe('extractSignPayload', () => {
  it('devuelve el string exacto de body.request', () => {
    expect(extractSignPayload({ request: '{"call":"websocket.getNetworkInfo","params":{},"timestamp":123}' }))
      .toBe('{"call":"websocket.getNetworkInfo","params":{},"timestamp":123}');
  });

  it('devuelve null si falta, no es string, o el body no es un objeto', () => {
    expect(extractSignPayload({})).toBeNull();
    expect(extractSignPayload({ request: 123 })).toBeNull();
    expect(extractSignPayload({ request: '' })).toBeNull();
    expect(extractSignPayload(null)).toBeNull();
    expect(extractSignPayload('un string cualquiera')).toBeNull();
  });
});

describe('signWithPrivateKey', () => {
  it('firma el string EXACTO recibido -- la firma verifica contra ese mismo string con la clave pública', async () => {
    const { privateKeyPem, publicKey } = await generateTestKeyPair();
    const message = '{"call":"printers.find","params":{"query":null},"timestamp":1234567890}';

    const signatureBase64 = await signWithPrivateKey(privateKeyPem, message);
    expect(typeof signatureBase64).toBe('string');
    expect(signatureBase64.length).toBeGreaterThan(0);

    const signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signatureBytes,
      new TextEncoder().encode(message),
    );
    expect(isValid).toBe(true);
  });

  it('una firma para un mensaje distinto NO verifica (protege contra reutilizar una firma vieja)', async () => {
    const { privateKeyPem, publicKey } = await generateTestKeyPair();
    const signatureBase64 = await signWithPrivateKey(privateKeyPem, 'mensaje original');
    const signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));

    const isValidForOtherMessage = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signatureBytes,
      new TextEncoder().encode('mensaje distinto'),
    );
    expect(isValidForOtherMessage).toBe(false);
  });

  it('una clave privada mal formada lanza QzSignError con code INVALID_PRIVATE_KEY, nunca revienta sin capturar', async () => {
    await expect(signWithPrivateKey('esto no es una clave PEM', 'x')).rejects.toBeInstanceOf(QzSignError);
    await expect(signWithPrivateKey('esto no es una clave PEM', 'x')).rejects.toMatchObject({ code: 'INVALID_PRIVATE_KEY' });
  });
});

describe('ninguna clave privada real vive en el código de esta función', () => {
  const libSource = readFileSync('supabase/functions/qz-sign/lib.ts', 'utf8');
  const indexSource = readFileSync('supabase/functions/qz-sign/index.ts', 'utf8');

  it('lib.ts e index.ts no contienen ningún bloque PEM de clave privada', () => {
    for (const source of [libSource, indexSource]) {
      expect(source).not.toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
    }
  });

  it('index.ts lee la clave privada desde Deno.env, nunca la hardcodea', () => {
    expect(indexSource).toMatch(/Deno\.env\.get\('QZ_SIGN_PRIVATE_KEY'\)/);
  });

  it('index.ts nunca usa la service_role/secret key -- solo la publishable key para validar el JWT del caller', () => {
    expect(indexSource).not.toMatch(/SERVICE_ROLE|getSupabaseAdminKey/);
    expect(indexSource).toMatch(/getSupabasePublishableKeyOrEmpty/);
  });

  it('index.ts nunca devuelve la clave privada en la respuesta -- solo el campo "signature"', () => {
    const successResponseMatch = indexSource.match(/jsonResponse\(\{ signature \}, 200, corsHeaders\);/);
    expect(successResponseMatch).not.toBeNull();
    expect(indexSource).not.toMatch(/privateKeyPem[^)]*jsonResponse|jsonResponse\([^)]*privateKeyPem/);
  });
});
