# Respaldo de credenciales fiscales — 2026-11-09 (antes de rotar FISCAL_MASTER_KEY)

## Por qué existe

El 2026-11-09 la variable `FISCAL_MASTER_KEY` de Vercel (Production y Preview) quedó con un valor
ajeno (`sk_live_…`). La clave maestra original **sigue en Supabase** (secreto de `fiscal-emit`):
descifró las credenciales de ambas empresas al emitir los folios 25006 (11:42 UTC) y 51110
(12:10 UTC). Supabase no permite leer ese valor, solo su huella SHA-256.

Antes de rotar la clave se copiaron, sin descifrar, las credenciales cifradas y su contexto.

## Dónde está

| Objeto | Contenido |
|---|---|
| Esquema `fiscal_backup` | Solo `postgres`. Sin `USAGE` para `public`, `anon`, `authenticated`, `service_role` ni `authenticator`. No está entre los esquemas que expone la API. |
| `fiscal_backup.business_credentials_20261109` | 2 filas (Artesellos `85e80cd0-…`, Bonita `cda904a1-…`): `business_id, provider, key_version, ciphertext, iv, auth_tag, created_at, updated_at` + `credential_fp` + `row_sha256`. |
| `fiscal_backup.rut_confirmations_20261109` | 2 filas: confirmación de RUT de cada empresa, ligada al `credential_fp` de su credencial. |
| `fiscal_backup.issuers_20261109` | 2 filas: estado del emisor (RUT, aprobado, habilitado, verificado, resolución, IVA por defecto). |
| `fiscal_backup.manifest` | `20261109_pre_rotation`: fecha, transacción, conteos y sumas de comprobación. |

Las cuatro tablas tienen RLS forzado sin políticas, ningún privilegio para roles de la API y
triggers que rechazan `UPDATE`, `DELETE` y `TRUNCATE`.

- Migración aplicada: `20261109132105` `fiscal_credentials_backup_20261109`.
- SQL: `supabase/fiscal-recovery/backups/20261109_credentials_backup.sql`.
- La copia se hizo con las tablas de origen bloqueadas contra escritura (`SHARE`), en una sola transacción.

## Verificación hecha al crearlo

- Bytes de `ciphertext`, `iv` y `auth_tag` idénticos a los originales; metadatos idénticos.
- `row_sha256` y `credential_fp` iguales a los recalculados sobre los originales.
- El `credential_fp` de cada credencial coincide con su última confirmación de RUT.
- Confirmaciones y emisores idénticos (comparación `to_jsonb` fila a fila).
- Sumas de comprobación del manifiesto iguales a las recalculadas sobre los originales:
  - credenciales `d19f31b3…8749dda`
  - confirmaciones `5595c87a…2e48d76`
  - emisores `e665730a…6cc5072`
- Un `UPDATE` de prueba fue rechazado por el trigger de solo lectura.
- Historial fiscal sin cambios respecto de la línea base previa: emisiones (4), folios (3), recibos
  (2), con huellas de XML y PDF; interruptor apagado.

Para volver a verificar (solo lectura):

```sql
select m.checksums->>'business_credentials' =
       (select encode(sha256(convert_to(string_agg(row_sha256, ',' order by business_id), 'UTF8')), 'hex')
          from fiscal_backup.business_credentials_20261109) as respaldo_integro
  from fiscal_backup.manifest m where backup_id = '20261109_pre_rotation';
```

## Dependencia crítica

Estas filas están cifradas con AES-256-GCM con la **clave maestra original** (AAD
`business_id|provider|key_version`). **Sin esa clave no sirven para nada**: no se pueden descifrar
ni reutilizar con otra clave.

- Hoy esa clave solo existe en el secreto `FISCAL_MASTER_KEY` de Supabase.
- **Al reemplazar ese secreto se pierde para siempre**, salvo que aparezca una copia fuera de las
  plataformas (gestor de contraseñas, `.env` local, historial del terminal).
- Antes de rotar: anotar la huella SHA-256 que muestra Supabase para el secreto actual, para
  reconocer la clave original si aparece una copia.

## Restauración (solo con autorización expresa)

Condición previa: `FISCAL_MASTER_KEY` vuelve a ser la clave original en Supabase **y** en Vercel
(misma huella), y no hay emisiones en curso. Interruptor apagado.

1. Verificar la integridad del respaldo (consulta de arriba).
2. Guardar primero, con el mismo método, las credenciales vigentes en ese momento.
3. En una transacción, con `fiscal.business_credentials` bloqueada:
   ```sql
   update fiscal.business_credentials c
      set provider = b.provider, key_version = b.key_version, ciphertext = b.ciphertext,
          iv = b.iv, auth_tag = b.auth_tag, updated_at = now()
     from fiscal_backup.business_credentials_20261109 b
    where c.business_id = b.business_id;
   ```
   No usar `crm_fiscal_save_credentials`: esa función habilita el emisor desde cero
   (`enabled`/`verified` en false).
4. Comprobar que `fiscal.credential_fp(business_id)` es igual a
   `fiscal_backup.business_credentials_20261109.credential_fp`. Debe serlo: la huella usa los bytes
   cifrados, el proveedor y la versión, no `updated_at`.
   - Si la última confirmación de RUT de la empresa es la original, vuelve a ser válida.
   - Si hubo una confirmación posterior, con la huella de otra credencial, el dueño confirma su RUT
     de nuevo.
5. Si el emisor cambió de estado por un registro posterior (`pending_review`, `enabled=false`), un
   admin lo reaprueba en Administración → Altas de facturación. Usar `issuers_20261109` como
   referencia de resolución e IVA por defecto, no como sobrescritura automática.
6. Probar sin emitir: «Consultar estado SII» de una boleta emitida de cada empresa (descifra la
   credencial y solo lee en DTE Core).

Las confirmaciones de RUT y el historial de auditoría no se borran: son de solo inserción, así que
las filas originales siguen en `fiscal.rut_confirmations`; el respaldo es una copia de referencia.

## Qué NO cubre

No contiene la clave maestra ni API keys en claro. Boletas, XML, PDF, folios y estados ante el SII
no dependen de la clave maestra y no forman parte de este respaldo; siguen en sus tablas.
