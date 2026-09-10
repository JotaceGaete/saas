/**
 * 20260910190000_reactivate_process_email_queue_cron.sql — tests estáticos
 * (source-scan) de la migración PREPARADA (no aplicada, no ejecutable) que
 * reactivaría el cron de process-email-queue. Mismo criterio que
 * 20260910180000_payment_confirmation_emails.test.ts -- no hay entorno
 * Postgres en Vitest.
 *
 * EMAIL-PAYMENTS-1D: corrige un gap real -- el net.http_post de ejemplo no
 * incluía x-email-secret, y process-email-queue ahora lo exige de forma
 * obligatoria (hardening de EMAIL-PAYMENTS-1). Si alguien descomentara la
 * migración tal como estaba antes de este fix, el cron recibiría 401 en
 * cada ejecución.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260910190000_reactivate_process_email_queue_cron.sql?raw';

describe('20260910190000 — sigue 100% comentada, cero SQL ejecutable', () => {
  it('ninguna línea del archivo es SQL real -- todo es comentario (--) o línea en blanco', () => {
    const executableLines = migrationSource
      .split('\n')
      .filter((line) => !/^\s*--/.test(line) && line.trim() !== '');
    expect(executableLines).toEqual([]);
  });

  it('no contiene ningún CREATE/SELECT/DROP fuera de un comentario -- verificación adicional por regex de línea completa', () => {
    // Cinturón y tirantes respecto al test anterior: confirma que ninguna
    // sentencia SQL real quedó fuera del prefijo -- por error de edición.
    const lines = migrationSource.split('\n');
    for (const line of lines) {
      if (/^\s*--/.test(line) || line.trim() === '') continue;
      expect(line).not.toMatch(/^(CREATE|SELECT|DROP|ALTER|INSERT|UPDATE|DELETE)\b/i);
    }
  });
});

describe('20260910190000 — el ejemplo comentado ahora incluye x-email-secret', () => {
  it('el net.http_post de ejemplo agrega el header x-email-secret', () => {
    expect(migrationSource).toMatch(
      /'x-email-secret', \(SELECT decrypted_secret FROM vault\.decrypted_secrets WHERE name = 'email_function_secret'\)/,
    );
  });

  it('sigue enviando Authorization/apikey con anon_key, sin removerlos -- el fix es aditivo', () => {
    expect(migrationSource).toMatch(
      /'Authorization', 'Bearer ' \|\| \(SELECT decrypted_secret FROM vault\.decrypted_secrets WHERE name = 'anon_key'\)/,
    );
    expect(migrationSource).toMatch(
      /'apikey',\s+\(SELECT decrypted_secret FROM vault\.decrypted_secrets WHERE name = 'anon_key'\)/,
    );
  });

  it('lee email_function_secret desde vault.decrypted_secrets -- mismo patrón ya usado por wa_send_welcome_email_on_signup, nunca hardcodeado', () => {
    expect(migrationSource).toMatch(/vault\.decrypted_secrets WHERE name = 'email_function_secret'/);
    // Nunca un valor de secret real embebido -- solo el nombre del secret.
    expect(migrationSource).not.toMatch(/x-email-secret['"]?\s*[,:]\s*['"][^'"$]{8,}['"]/);
  });

  it('documenta que EMAIL_FUNCTION_SECRET (env var) y email_function_secret (Vault) deben contener el mismo valor', () => {
    expect(migrationSource).toMatch(/EMAIL_FUNCTION_SECRET/);
    expect(migrationSource).toMatch(/mismo valor que el\s*\n--\s*secret email_function_secret del Vault/);
  });
});
