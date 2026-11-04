# F3 — Puesta en marcha de la emisión fiscal (PR #108)

Estado: **diseño y verificación parcial**. No se emitió nada, no se consumió ningún folio, no se aplicó ninguna migración en producción y no se fusionó el PR. PR #108 sigue en borrador.

## Resumen

| # | Punto | Resultado | Bloquea la primera boleta |
|---|---|---|---|
| 1 | Contrato PostgREST real | **No ejecutado.** Bloqueo de red: el proxy rechaza `registry-1.docker.io` (403, política). No se buscó otra ruta. | Sí |
| 2 | Política UPDATE en `wa_businesses` | **Verificado** en producción (solo lectura). Ninguna escritura de la app toca `user_id`. Riesgo a futuro: columnas nuevas necesitan GRANT explícito. | No (con el riesgo documentado) |
| 3 | Contrato DTECore | **No verificable desde el repo ni desde la web.** Faltan respuestas escritas del proveedor. | **Sí** |
| 4 | Planificador de recuperación | **Diseñado**, no habilitado. Carreras revisadas: cerradas por candado de asesoría. | No para la primera boleta (se opera a mano) |
| 5 | Despliegue gradual | **Plan** con fases, criterios, rollback y activación por comercio. | — |

Además, bloquea la primera boleta una brecha de producto: **la interfaz de Walinka no llama al emisor**. El TPV solo lee documentos (`src/pages/crm/CrmFiscalDocument.jsx`). Ningún `config.toml` registra `fiscal-emit`.

## 1. PostgREST real

Qué se intentó:

- Docker: el daemon arranca, pero `docker pull postgrest/postgrest:v12.2.3` recibe **403 del proxy** en `registry-1.docker.io:443` (registro en `/__agentproxy/status`: `connect_rejected`).
- Binario oficial en GitHub: `github.com` responde 403.
- Por política del entorno no se usan rutas alternativas (otros registros, binarios de terceros). El daemon se detuvo al terminar.

Lo que queda listo: `npm run test:contract` (suite y script con bloqueos de producción). Para ejecutarlo en una máquina con acceso:

```
# Opción A: binario oficial
POSTGREST_BIN=/ruta/postgrest PGRST_DB_URI='postgres://postgres:<clave>@localhost:5544/walinka_test' \
  npm run test:contract

# Opción B: imagen oficial (requiere un pequeño cambio en scripts/postgrest-contract/run.sh para modo docker)
```

Dependencias exactas: PostgREST ≥ 12; `walinka_test` con la migración aplicada; roles `anon`, `authenticated`, `service_role` (presentes en `walinka_test`). Falta el rol `authenticator`: se conecta como `postgres` local, lo que es menos fiel a Supabase. Criterio: 5/5 pruebas de `test/contract` en verde contra PostgREST real.

## 2. Política UPDATE sobre `wa_businesses`

Verificado en producción (solo `SELECT` sobre `information_schema` y `pg_policies`):

- La migración concede UPDATE por columna a `anon` y `authenticated` **excepto `user_id`**.
- Las 20 columnas que escribe el cliente (`src/services/waBusinessService.js`: `logo_url`, `cover_image_url`, `lat`, `lng`, `slug`, `is_active`, `design_settings`, `operating_days`, `rubro_id`, `instagram_url`, `tiktok_url`, `facebook_url`, `business_mode`, `document_title_type`, `print_legend`, `plan_slug`, `plan_expires_at`, `trial_expires_at`, `country`, `currency`) existen y quedan concedidas.
- El payload del cliente nunca incluye `user_id`. Los `update` filtran por `user_id` en la condición, lo que requiere solo SELECT sobre esa columna.
- Escrituras de servidor: `mp-webhook`, `paddle-webhook` y `create-paddle-checkout` (admin) usan `serviceRoleKey`. No dependen del privilegio revocado.
- La migración `referral_core_user_centric` escribe en `referral_codes`, no en `wa_businesses`.
- La política RLS `wa_businesses_owner_all` (`WITH CHECK user_id = auth.uid()`) ya impedía asignar otro dueño desde el cliente.

**Riesgo a futuro (no bloquea):** una columna nueva de `wa_businesses` no será escribible por `authenticated` hasta que una migración haga `GRANT UPDATE (columna)`. Antes el privilegio de tabla la cubría. Mitigación: añadir a la guía de migraciones una línea obligatoria, o un *event trigger* que conceda UPDATE en `ddl_command_end`.

**Limitación de la prueba:** `walinka_test` no tiene grants de Supabase, así que allí solo se prueba el caso negativo (`user_id` no escribible).

## 3. Contrato DTECore

Lo que el repo sabe (`F1-arquitectura-emision.md` §3 y `F2-diseno-implementacion.md` §1):

| Punto | Estado |
|---|---|
| Llamada: `idBoletaOperacion`, `retornarPdf=true`, `formatoPdf="80mm"`, `modoPdfSalida="base64"` | Documentado en el informe de integración. No verificado con respuesta real. |
| Forma exacta de la respuesta con PDF (¿`pdfBase64`? ¿anidado?) | **Desconocido** |
| Comportamiento ante `idBoletaOperacion` repetido | **Desconocido.** Decide si la idempotencia existe. |
| Consulta de estado ante el SII (aceptada/rechazada) | **Desconocida.** La 51104 quedó en REC (-11). |
| Multiempresa: una cuenta o una API key por empresa | **Desconocido** |
| Folios agotados y certificado vencido | **Desconocido** |

Búsqueda web: no hay documentación pública de DTECore. Los resultados corresponden a LibreDTE y otros proveedores; no se usan como contrato.

**Qué se necesita del proveedor, por escrito:**

1. Ejemplo real de respuesta de emisión con `retornarPdf=true` (éxito, error de validación, timeout).
2. Qué ocurre si se envía dos veces el mismo `idBoletaOperacion`: mismo folio, error o nueva emisión.
3. Endpoint o webhook de estado SII y cómo identificar la boleta.
4. Modelo de credenciales (API key por empresa o por cuenta).
5. Entorno de certificación con folios de prueba, y confirmación de que no consumen folios de producción.

**Regla de diseño que se mantiene:** si la respuesta no permite distinguir "emitida" de "no emitida", la operación queda `unknown` y no se reintenta. Con respuestas reales se fija el contrato en pruebas (`test/contract`-style) antes de activar nada.

## 4. Planificador de recuperación (diseño, no habilitado)

**Objetivo:** llevar a estado terminal las filas `sending` vencidas sin volver a llamar al proveedor.

**Disparador:** función `fiscal-recover` invocada por cron (pg_cron o programación del proyecto), **deshabilitada por defecto** mediante variable `FISCAL_RECOVERY_ENABLED=false`. Cadencia propuesta: cada 15 minutos, con `staleAfterMs` de 15 minutos (`FISCAL_STALE_AFTER_MS`).

**Ciclo por ejecución:**

1. `crm_fiscal_list_stale_sending(now() - staleAfterMs)` → filas vencidas con `has_receipt`.
2. Para cada fila:
   - Con recibo: `crm_fiscal_finalize_from_receipt` (estado `issued` con el folio y PDF guardados).
   - Sin recibo: `crm_fiscal_mark_stale_unknown` (estado `unknown`, código `STALE_SENDING`).
3. Nunca se llama a DTECore. Nunca se reemite.
4. Registro de resultados: contadores (`examined`, `finalizedFromReceipt`, `markedUnknown`, `untouched`).

**Carreras revisadas:**

- Recuperación vs. persistencia del recibo: `crm_fiscal_store_receipt` y `crm_fiscal_mark_stale_unknown` toman el mismo candado de asesoría por venta (`fiscal_sale:<sale_id>`). Se serializan. Si el recibo existe, la marca de vencida se rechaza.
- Recuperación vs. reconciliación: la reconciliación solo actúa sobre `unknown`. Una fila `sending` vencida primero debe pasar por la recuperación; la reconciliación no la toma (probado).
- Recuperación vs. finalización normal: `finalize` exige `status = 'sending'` bajo `FOR UPDATE`. Si la recuperación ya cerró la fila, la finalización devuelve `false` y el emisor lee el estado real (probado sin llamadas extra al proveedor).

**Condiciones para habilitarlo (fuera de esta etapa):**

- Contrato DTECore cerrado (sección 3).
- Migración aplicada en producción y verificada.
- Métricas visibles: número de filas vencidas, resueltas desde recibo, marcadas `unknown`.
- Alertas si hay `unknown` sin resolver más de 24 h.

## 5. Plan de despliegue gradual

**Precondiciones (todas):**

- Respuestas escritas de DTECore (sección 3).
- Entorno de certificación con folios de prueba autorizados por el dueño.
- `test:contract` en verde contra PostgREST real.
- Copia de seguridad de los grants actuales de `wa_businesses`, de `fiscal.issuers` y del estado de `fiscal.dte39_emission_control`.

**Fase 0 — Revisión (sin cambios en producción).** Revisión del PR por el dueño. Ensayo de la migración en un clon de producción (no de `walinka_test`).

**Fase 1 — Migración en producción** (ventana controlada, aprobación explícita):

1. Capturar baseline: grants de `wa_businesses`, filas de `fiscal.issuers`, `dte39_emission_control`.
2. Aplicar `20261031_fiscal_single_ledger_guard.sql` (incluye el bloqueo de las cuatro ventas Point y el cierre de UPDATE de `user_id`).
3. Verificar: las cuatro ventas Point bloqueadas; boleta 51106 intacta; dos operaciones del piloto `pending`; 17 filas P3 `skipped`; `has_column_privilege(authenticated, user_id, UPDATE) = false`.
4. El emisor sigue deshabilitado: `dte39_emission_control.enabled = false`.

**Fase 2 — Código de la API** (después de la migración, nunca antes): desplegar `api/fiscal/*` con la guarda por rol. Si se despliega antes, `crm_fiscal_actor_role` no existe y los endpoints de lectura responden 503.

**Fase 3 — Emisor en certificación:** desplegar `fiscal-emit` con proveedor DTECore en certificación y un negocio de prueba. Pruebas: emisión, reintento, timeout, recuperación manual. Solo con folios de prueba y autorización del dueño por emisión.

**Fase 4 — Interfaz:** añadir la acción de emitir en el TPV, detrás de un indicador por comercio (sección abajo). No existe hoy.

**Fase 5 — Activación por comercio:** un comercio piloto en Chile. Condiciones: `fiscal.issuers.enabled = true` y `verified = true` para ese negocio, roles fiscales asignados, emisión global habilitada solo durante la ventana. Un comercio a la vez; esperar 48 h entre activaciones.

**Rollback por fase:**

| Fase | Rollback |
|---|---|
| 1 | Script de reversión (a escribir y revisar antes de la fase 1): `drop function public.crm_fiscal_reconcile_admin(...)`; `grant update on public.wa_businesses to anon, authenticated;` (estado previo); `drop trigger wa_businesses_owner_change …`; `drop function fiscal.handle_owner_change()`. Las filas de roles y auditoría se conservan (solo-anexar). |
| 2 | Redesplegar la versión anterior de `api/fiscal/*`. |
| 3 | `dte39_emission_control.enabled = false`. Desactivar la función. |
| 4 | Ocultar la acción de emitir en el TPV (indicador global). |
| 5 | `fiscal.issuers.enabled = false` para el comercio. Las filas emitidas no se tocan. |

El rollback nunca modifica folios, PDF ni XML emitidos.

**Activación por comercio:** la combinación ya existente es `fiscal.issuers` (`enabled`, `verified`), roles en `fiscal.business_fiscal_roles` y el interruptor global `fiscal.dte39_emission_control`. No hace falta un indicador nuevo para la primera etapa.

## 6. Primera boleta desde Walinka vs. segunda etapa

**Imprescindible para la primera boleta emitida desde la interfaz:**

1. Respuestas escritas de DTECore: forma de la respuesta con PDF, idempotencia, errores de validación (sección 3).
2. Contrato PostgREST verificado (`test:contract` en verde contra PostgREST real).
3. Migración aplicada en producción, con verificaciones de la fase 1.
4. Acción de emitir en el TPV, con el indicador por comercio.
5. Un comercio piloto con `fiscal.issuers` verificado y roles asignados.
6. Autorización explícita del dueño para cada folio consumido, y un entorno de certificación previo.
7. Operación manual de la recuperación: el operador revisa las filas `sending` y `unknown` tras cada emisión. El planificador automático no es necesario para esta etapa.

**Puede esperar a una segunda etapa:**

- Planificador automático de recuperación (diseño listo, sección 4).
- Reconciliación desde interfaz (hoy solo por RPC administrativa).
- Consulta de estado ante el SII.
- Emisión automática desde Point (P4) y Mercado Pago.
- Multiempresa con API keys separadas.
- Notas de crédito y anulación (`issued → cancelled`).
- Reimpresión por ESC/POS o raster (depende de DTECore).
- Retiro formal de P1, P3 y P4 como productores.

## 7. Decisiones que necesita el dueño

1. Solicitar a DTECore las respuestas de la sección 3 por escrito.
2. Autorizar el entorno de certificación y la cantidad de folios de prueba.
3. Aprobar la ventana para la fase 1 y el comercio piloto.
4. Definir quién puede conciliar un `unknown` y con qué evidencia (política tributaria, pendiente desde F2).
5. Confirmar si la 51106 fue reportada al SII como certificación o producción.
