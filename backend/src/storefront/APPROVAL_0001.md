# Informe de aprobación para producción — `0001_storefront_read_model.sql`

Estado: **propuesta revisada. No aplicada. Requiere autorización explícita de Juan.**
Ninguna sentencia se ha ejecutado en Supabase de producción. Las lecturas (SELECT) sobre producción son las únicas consultas realizadas.

## 1. Objetos nuevos

| Objeto | Tipo | Notas |
|---|---|---|
| `extensions.unaccent` | extensión | Ya existe en producción en el esquema `extensions`. La sentencia es no-op allí. |
| `public.storefront_fold(text)` | función SQL, `STABLE`, `search_path = public, pg_catalog` | Normaliza a minúsculas sin tildes. Invoca el diccionario calificado. |
| `public.wa_storefront_products_v` | vista `security_invoker` | Solo filas públicas (`is_active`, `status = 'active'`, `NOT is_draft`) y columnas en lista blanca. Excluye SKU, código de barras, tratamiento tributario y costos. |
| `public.storefront_list_products(...)` | función plpgsql, `SECURITY INVOKER` | Filtro, búsqueda, orden y keyset dentro de PostgreSQL. Límite acotado a 1..61. Valida sort, filter y cursor incompleto (SQLSTATE 22023). |
| `public.storefront_categories(uuid)` | función SQL | Categorías derivadas de productos públicos. |
| `public.storefront_product(uuid, text)` | función SQL | Detalle por slug dentro de un comercio. |
| `public.storefront_products_by_ids(uuid, uuid[])` | función SQL | Complementos de la misma tienda. Máximo 100 ids. |
| `public.storefront_business(text)` | función SQL | Perfil público, solo comercios activos. |
| `public.wa_storefront_banners` | tabla | Banners por comercio. Entidad independiente de `public.banners` (plataforma), que no se toca. RLS habilitado **sin políticas**. |
| `wa_storefront_banners_lookup_idx` | índice B-tree | `(business_id, placement, status, position, id)`. Tabla nueva y vacía. |
| `public.storefront_banners(uuid, text)` | función SQL | Banners activos dentro de la ventana de vigencia, orden `position, id`, máximo 50. |

## 2. Objetos existentes modificados

**Ninguno.** La migración no altera `wa_products`, `wa_businesses`, `wa_business_categories`, `banners` ni ninguna política, trigger o índice existente. Solo los lee.

Único impacto sobre tablas actuales: la clave foránea `wa_storefront_banners.business_id → wa_businesses(id)` toma un bloqueo `SHARE ROW EXCLUSIVE` sobre `wa_businesses` durante la creación. Como la tabla de banners nace vacía, la validación dura milisegundos, pero las escrituras concurrentes sobre `wa_businesses` esperan ese tiempo. Recomendación: aplicar en ventana de bajo tráfico o dividir en `ADD CONSTRAINT ... NOT VALID` seguido de `VALIDATE CONSTRAINT`, que no bloquea escrituras.

## 3. Permisos

Supabase concede por defecto a `anon` y `authenticated` privilegios completos sobre tablas nuevas en `public` (`arwdDxtm`) y `EXECUTE` sobre funciones nuevas (verificado con `pg_default_acl` en producción). La migración revoca explícitamente esos privilegios:

- **Revocado** de `public`, `anon` y `authenticated`: la vista, la tabla de banners y las 8 funciones.
- **Otorgado a `service_role`**: `SELECT` sobre la vista; `SELECT, INSERT, UPDATE, DELETE` sobre `wa_storefront_banners`; `EXECUTE` sobre las 8 funciones (incluida `storefront_fold`, necesaria porque las funciones `SECURITY INVOKER` la invocan como `service_role`).

Consecuencia: el catálogo público solo es accesible a través de la API con clave `service_role` en servidor. No hay acceso directo desde el cliente con clave anónima.

Verificación posterior obligatoria (SELECT, sin modificar nada):
```sql
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'storefront%';
-- Esperado: anon_exec = false y auth_exec = false en todas las filas.
```

## 4. Índices

- Creado: `wa_storefront_banners_lookup_idx` (tabla nueva).
- **No creado en esta migración**: índices sobre `wa_products`. Con 1.262 filas en producción (1.984 kB) los índices existentes por `business_id` son suficientes para el volumen actual.
- Candidatos documentados, solo si una medición con `EXPLAIN (ANALYZE, BUFFERS)` lo justifica: `(business_id, sort_order, id)` y `(business_id, price, id)`, parciales sobre el predicado público. Se crearían con `CREATE INDEX CONCURRENTLY` en un script aparte, porque no puede ejecutarse dentro de una transacción de migración.
- La búsqueda por subcadena (`strpos` sobre `storefront_fold(name)`) no usa índices B-tree. Es una búsqueda lineal dentro del comercio, aceptable a este volumen. Si crece, se evaluará `pg_trgm` (disponible en producción pero no instalado) sobre una columna normalizada, en una migración separada.

## 5. Ordenación

- Orden de nombre: `collate "es-CL-x-icu"`. Existe en producción (PostgreSQL 17.6; 29 collations `es*` ICU). Verificado en réplica: el orden SQL coincide con `Intl.Collator('es-CL')` en la muestra de prueba.
- Desempate siempre por `id` ascendente.
- La clave del cursor (`sort_order`, `price` o `name`) se compara con el mismo collation.

## 6. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Búsqueda lineal por comercio | Baja | Volumen actual bajo; medir con datos reales antes de añadir `pg_trgm`. |
| Default privileges de Supabase | Media | Revocaciones explícitas en la migración + verificación SELECT posterior (sección 3). |
| `storefront_fold` marcado `STABLE` | Baja | No se usa en índices de expresión, por lo que no hay riesgo de inconsistencia. |
| Bloqueo breve de `wa_businesses` por la FK | Baja | Tabla vacía; ventana de bajo tráfico o `NOT VALID` + `VALIDATE`. |
| PostgreSQL 17 no validado localmente | Media | Ver sección 8. Todas las funciones usadas existen desde PostgreSQL 15 (`security_invoker` en vistas, `gen_random_uuid` desde 13). |
| Función `SECURITY INVOKER` ejecutada como `service_role` | Baja | Equivale a acceso total del backend. La protección de datos depende de no conceder `EXECUTE` a otros roles; verificado por la prueba de permisos. |
| Ruptura de la API si se revierte la migración sin revertir el montaje | Media | Orden de rollback en sección 9. |

## 7. Pruebas

Realizadas en réplica local (PostgreSQL 16.15 con ICU, esquema `unaccent` en `extensions`):

- Aplicación de `0001` sin errores con `ON_ERROR_STOP=1`.
- Pruebas de paridad (25) y de integración de base de datos (11): **36/36 pasan**. Incluyen aislamiento entre comercios, cursores de otro comercio (400), banners vigentes, empates con paginación de a 1, límites de la función SQL y permisos denegados para `anon` y `authenticated`.
- `storefront_fold('CAFÉ') = 'cafe'`.

Pendientes antes de aprobar:

1. Verificar en producción la sección 3 (SELECT).
2. Ejecutar `0001` en PostgreSQL 17 (ver sección 8).
3. `EXPLAIN (ANALYZE, BUFFERS)` de `storefront_list_products` con un comercio de tamaño real en réplica con volumen comparable (la réplica actual tiene 14 productos y no sirve para medir planes).
4. Probar el rollback completo en réplica (sección 9) y volver a aplicar 0001 después.
5. Confirmar que `public.banners` de plataforma no se ve afectada (no se referencia en 0001).

## 8. ¿Podemos validar PostgreSQL 17 localmente sin servicios adicionales?

**No, no en este entorno.** Comprobado:

- Solo hay binarios de PostgreSQL 16 (`/usr/lib/postgresql/16`).
- `apt` no tiene candidato `postgresql-17` accesible.
- Docker está instalado, pero el daemon no responde.

Opciones sin contratar nada:

- **GitHub Actions con servicio `postgres:17`**: contenedor oficial, sin coste en el plan gratuito. Es la opción recomendada: un workflow que aplica 0001 y 0002 y ejecuta la suite `test:storefront` con `DATABASE` apuntando al servicio. No requiere cambios en producción.
- Máquina de Juan con `postgresql-17` instalado por apt o Homebrew, si prefiere evitar CI.

Riesgo aceptado hasta validar: el SQL solo usa características presentes en PostgreSQL 15 y posteriores, pero **no está probado en 17**. No se debe aprobar la aplicación en producción sin esa prueba.

## 9. Plan de rollback

Script: `backend/src/storefront/review/0001_rollback.sql` (transaccional, no ejecutado).

Orden:

1. Desactivar o aceptar 500 en el montaje de la API (`/api/v1/storefront`). La API no debe quedar en servicio apuntando a funciones que no existen.
2. Exportar `wa_storefront_banners` si tiene filas (el script la elimina).
3. Ejecutar el script: funciones → tabla de banners → vista → `storefront_fold`.
4. **No eliminar `unaccent`**: existía antes de 0001.

Ningún objeto existente se modifica, por lo que el rollback no restaura nada más.

## 10. Dependencia entre migraciones

- `0001` no depende de `0002`. Solo referencia `wa_businesses`, `wa_products`, `wa_business_categories` y `unaccent`.
- `0002` no depende de `0001`. Solo referencia `wa_businesses`.
- Pueden aplicarse en cualquier orden y por separado. El catálogo público (`0001`) no lee tablas de `0002`.
- Sin `0002`, las rutas `/texts` y `/pages` devuelven 404. Sin `0001`, el catálogo devuelve 500 de forma controlada. Ninguna depende de la otra para funcionar.

## 11. Revisión de `0002` (resumen)

Sin bloqueos. Tablas `wa_storefront_texts`, `wa_storefront_pages`, `wa_storefront_page_blocks`: constraints de forma, `ON DELETE CASCADE` a `wa_businesses`, RLS habilitado sin políticas, `REVOKE` a `public`, `anon` y `authenticated`. Sin funciones, por lo que no añade superficie de ejecución. Pendiente: las funciones de lectura y escritura del panel, en una migración posterior con autorización.

## 12. Montaje en Vercel (sin desplegar)

- El proyecto de producción está en estado `READY` con un despliegue de tipo LAMBDAS, unas 21 funciones en `api/`. El límite del plan del equipo no se pudo confirmar con las herramientas disponibles (`get_team` no devuelve plan).
- El rewrite propuesto va **en la primera posición** de `vercel.json`. Motivo: `/(.*) → /index.html` está en la posición 20 y sombrearía cualquier regla posterior.
- Se añade una única función (`api/storefront.js`), a partir de `review/api-storefront.candidate.js`. El diff de `review/vercel.json.proposed` contra el actual es solo ese rewrite.
- No hay colisiones: no existe ninguna ruta `/api/v1/storefront` en el repositorio.
- Pendiente: decidir con Juan si el candidato entra en `api/` (aumenta el conteo de funciones en 1).
