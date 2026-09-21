/**
 * Control estructural (SEGURIDAD-WALINKA-1D): ningún consumidor PÚBLICO de
 * wa_businesses -- una tabla con RLS público, wa_businesses_public_read
 * USING (true) -- puede usar `select('*')`. RLS filtra filas, no columnas,
 * así que un `select('*')` expondría en el payload cualquier columna
 * reservada que exista en la tabla, la use o no la UI.
 *
 * Este test escanea el código fuente (no mockea nada) para las llamadas
 * `.from('wa_businesses')....select('*')` que existen hoy y confirma que
 * las únicas son admin/dueño-propio (gateadas por
 * wa_businesses_admin_select / wa_businesses_owner_all), nunca un
 * endpoint/página pública.
 *
 * A propósito NO allowlistea archivos completos: waBusinessService.js y
 * adminPaymentsService.js tienen múltiples funciones, y un archivo
 * allowlisteado entero dejaría pasar un select('*') público nuevo agregado
 * ahí (esto pasó durante el desarrollo de este mismo fix: la primera
 * versión de este test, con allowlist a nivel de archivo, no detectaba el
 * select('*') de getBusinessBySlug() porque el resto del archivo ya tenía
 * llamadas admin/dueño legítimas). La allowlist es por (archivo, nombre de
 * función que contiene la llamada) -- si alguien agrega un select('*')
 * público nuevo, en una función nueva o dentro de una ya listada, este
 * test falla igual.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

/**
 * (archivo, función) donde `select('*')` sobre wa_businesses es admin o
 * dueño-propio (confirmado en la auditoría de SEGURIDAD-WALINKA-1D,
 * sección B del informe) -- nunca un endpoint público/anónimo:
 * - waBusinessService.js: getMyBusiness() (dueño, eq('user_id', auth.uid())),
 *   getBusinessByIdForAdmin() y getBusinessesForAdmin() (admin).
 * - adminPaymentsService.js: getAdminBusinessSubscription() -- "Solo para
 *   usuarios con role admin" (ver comentario de cabecera del archivo).
 * - admin-users, create-mp-preference, create-paddle-checkout,
 *   plan-change-preview (Edge Functions, un solo handler por archivo, sin
 *   nombre de función exportada -- se allowlistea el archivo completo a
 *   propósito): usan un client con SUPABASE_SERVICE_ROLE_KEY, pero SIEMPRE
 *   filtrado por eq('user_id', user.id) donde `user` sale de
 *   userClient.auth.getUser() sobre el JWT del caller -- resuelven el/los
 *   negocio(s) del propio usuario autenticado, nunca de un business_id
 *   arbitrario recibido del cliente (create-mp-preference incluso lo
 *   registra explícitamente: "businessId en body IGNORADO -- se resuelve
 *   solo por auth.uid()"). Mismo patrón que getMyBusiness().
 */
const ALLOWED = new Set([
  'src/services/waBusinessService.js::getMyBusiness',
  'src/services/waBusinessService.js::getBusinessByIdForAdmin',
  'src/services/waBusinessService.js::getBusinessesForAdmin',
  'src/services/adminPaymentsService.js::getAdminBusinessSubscription',
  'supabase/functions/admin-users/index.ts::(handler)',
  'supabase/functions/create-mp-preference/index.ts::(handler)',
  'supabase/functions/create-paddle-checkout/index.ts::(handler)',
  'supabase/functions/plan-change-preview/index.ts::(handler)',
]);

const SCAN_DIRS = ['src', 'api', 'backend/src', 'supabase/functions'];
// El asterisco puede ir solo (select('*')) o combinado con un join
// (select('*, wa_rubros(name, slug)')) -- solo exige que el argumento de
// select() EMPIECE con `*` inmediatamente tras la comilla de apertura.
const SELECT_STAR_ON_WA_BUSINESSES = /from\((['"`])wa_businesses\1\)[\s\S]{0,120}?select\((['"`])\*/g;
const FUNCTION_DECL = /^export (?:const|async function|function) (\w+)/gm;

function listFilesRecursive(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name) && !/\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Nombre de la función exportada que contiene el índice dado, o '(handler)' si el archivo no declara ninguna (ej. Deno.serve de una Edge Function). */
function enclosingFunctionName(content, matchIndex) {
  let last = null;
  FUNCTION_DECL.lastIndex = 0;
  let m;
  while ((m = FUNCTION_DECL.exec(content))) {
    if (m.index > matchIndex) break;
    last = m[1];
  }
  return last ?? '(handler)';
}

describe('wa_businesses — ningún select(\'*\') fuera de contextos admin/dueño conocidos', () => {
  it('toda llamada select(\'*\') sobre wa_businesses está en la allowlist admin/dueño, por función', () => {
    const offenders = [];
    for (const dir of SCAN_DIRS) {
      for (const file of listFilesRecursive(path.join(ROOT, dir))) {
        const relPath = path.relative(ROOT, file).split(path.sep).join('/');
        const content = fs.readFileSync(file, 'utf8');
        SELECT_STAR_ON_WA_BUSINESSES.lastIndex = 0;
        let m;
        while ((m = SELECT_STAR_ON_WA_BUSINESSES.exec(content))) {
          const fnName = enclosingFunctionName(content, m.index);
          const key = `${relPath}::${fnName}`;
          if (!ALLOWED.has(key)) offenders.push(key);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('getBusinessBySlug() (el único consumidor público) sigue viviendo en waBusinessService.js', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src/services/waBusinessService.js'), 'utf8');
    expect(content).toMatch(/export const getBusinessBySlug = /);
  });
});
