# Dos claves maestras fiscales por versión (FISCAL_MASTER_KEY + FISCAL_MASTER_KEY_V2)

## Qué cambia

| | Versión 1 | Versión 2 |
|---|---|---|
| Secreto | `FISCAL_MASTER_KEY` (la clave original) | `FISCAL_MASTER_KEY_V2` + `FISCAL_MASTER_KEY_V2_KCV` |
| Dónde | Solo Supabase (`fiscal-emit`) | Supabase y Vercel (Production + Preview) |
| Uso | Descifrar las credenciales existentes (Artesellos, Bonita, el respaldo `fiscal_backup`) | Vercel cifra los registros nuevos (`key_version=2`); `fiscal-emit` los descifra |
| Se reemplaza | **Nunca**, mientras exista una credencial o un respaldo de versión 1 | Solo con una nueva rotación |

- Vercel ya **no lee** `FISCAL_MASTER_KEY` (hoy tiene un valor ajeno, `sk_live_…`). Se puede borrar
  después de activar la V2.
- Las credenciales existentes y sus confirmaciones de RUT **no se tocan**: siguen en versión 1, con
  la misma huella, la misma aprobación y la misma confirmación.
- La base ya admite cualquier versión mayor que 0 y la conserva en la huella de la credencial. No
  hace falta ninguna migración.

## Comprobación de clave (KCV): misma V2 en ambas plataformas

`FISCAL_MASTER_KEY_V2_KCV` es un HMAC-SHA256 de una etiqueta fija con la clave V2 (32 hex). No
permite recuperar la clave. Se configura **el mismo valor** en Supabase y en Vercel:

- **`fiscal-emit`** usa la V2 solo si el KCV que calcula coincide con el configurado. Si no:
  `v2 = kcv_missing | kcv_mismatch | invalid | same_as_v1` en el registro de arranque, la V2 no se
  usa, y las credenciales de versión 2 responden `CREDENTIAL_KEY_UNAVAILABLE`, antes de reservar la
  venta y sin llamar a DTE Core.
- **Vercel** cifra solo si su V2 coincide con el mismo KCV. Si no, guardar una API key responde
  `503 SERVER_NOT_CONFIGURED` sin escribir en la base. El resto de Facturación (estado, confirmar
  RUT, IVA por defecto) funciona igual.

Como ambas plataformas comparan su clave con el mismo KCV, ninguna acepta o cifra con una V2
distinta de la otra. Una V1 inválida sigue dejando `fiscal-emit` en 503, como hasta ahora. Una V2
mal configurada no afecta a la V1.

Nunca se registran ni se devuelven claves ni KCV calculados: solo estados.

## Activación (cada paso con autorización)

**A. Generar la clave (tú, en tu equipo; nunca en el chat)**

1. `openssl rand -base64 32` → guárdala de inmediato en tu gestor de contraseñas.
2. `node scripts/fiscal-master-key-check.mjs`: pega la clave cuando la pida; no se muestra.
   Imprime:
   - `sha256`: para comparar con la huella que muestra Supabase;
   - `kcv`: el valor para `FISCAL_MASTER_KEY_V2_KCV`. No es secreto; puedes compartirlo para
     verificar.

**B. Supabase → Edge Functions → Secrets (tú)**

3. **Agregar** `FISCAL_MASTER_KEY_V2` (la clave) y `FISCAL_MASTER_KEY_V2_KCV` (el kcv). **No editar
   `FISCAL_MASTER_KEY`.**
4. Comparar la huella de `FISCAL_MASTER_KEY_V2` en el panel con el `sha256` del paso 2.

**C. Desplegar `fiscal-emit` con este código (antes que Vercel)**

5. Desplegar desde el commit de esta rama, con `verify_jwt` activo, y comprobar archivos y hash.
6. Provocar un arranque con una consulta de estado de solo lectura, desde el TPV o la consola, y
   verificar en el registro: `"masterKeys":{"v1":"ok","v2":"ok"}` y `providerMode: dtecore`.
   **Si `v2` no es `ok`, detenerse.**
7. «Consultar estado SII» de NV-0065 y NV-1052, con el interruptor apagado: prueba que la V1 sigue
   descifrando las credenciales existentes.

**D. Vercel → Environment Variables (tú)**

8. Agregar `FISCAL_MASTER_KEY_V2` y `FISCAL_MASTER_KEY_V2_KCV`, **una sola variable cada una,
   marcada para Production y Preview**, con los mismos valores de los pasos 1 y 2.

**E. Desplegar el código de Vercel**

9. Preview: push de la rama, despliegue READY, `/api/fiscal/connection` sin sesión → `401`, y en los
   registros de ejecución **no** aparece `clave de cifrado V2 no disponible`.
10. Production: PR a `main` y fusión, con autorización. Mismas comprobaciones en go.walinka.com.

**F. Después**

11. Borrar en Vercel la variable `FISCAL_MASTER_KEY`, la del valor ajeno. Ya no se usa.
12. Primer registro nuevo de una API key: queda como `key_version=2`. Comprobar con «Consultar
    estado SII» que `fiscal-emit` la descifra.

## Reversión

- **Vercel:** Instant Rollback al despliegue anterior. Los registros de versión 2 hechos mientras
  tanto quedarían inutilizables con el código anterior, que falla cerrado (`CREDENTIAL_INVALID`).
  Por eso no se registran API keys hasta terminar la verificación.
- **`fiscal-emit`:** volver a desplegar la versión anterior. La V1 sigue siendo la misma, así que
  las credenciales existentes no se ven afectadas.
- **Base:** nada que revertir. El respaldo `fiscal_backup` (2026-11-09) sigue disponible y depende
  de la V1.

## Pruebas

- `test/unit/keyring.test.mjs`:
  - KCV;
  - estados de la V2;
  - llavero;
  - descifrado por versión;
  - versión cambiada en la fila;
  - V2 distinta en Supabase;
  - compatibilidad Vercel → `fiscal-emit`;
  - Vercel sin V2.
- `test/unit/two-keys.memory.test.mjs`:
  - emisión con credenciales v1 y v2;
  - V2 ausente;
  - versión 3;
  - cambio de versión durante el reclamo;
  - `status`;
  - compatibilidad con `masterKey`.
- `test/deno/master-keys.test.ts`: estados de arranque, registro sin valores, V1 obligatoria.
- `api/fiscal/connection.keys.test.js`: el manejador real ignora `FISCAL_MASTER_KEY`, responde sin
  V2 y no registra valores.
