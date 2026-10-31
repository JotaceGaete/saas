# Procedimiento: emisión única real de boleta (DTE 39), Bonita Casualidad

**Estado: preparado, NO ejecutado.** Este documento no autoriza nada. Cada paso
que toca producción requiere autorización expresa por escrito.

## Alcance
- Un solo negocio: `cda904a1-e331-4bd4-9f33-a6715687d3dd` (Bonita Casualidad).
- Una sola venta nueva de **$100 CLP en efectivo**, creada por el dueño.
- Una sola llamada al host de producción `https://api.siisolutions.cl/dte/boletas/emitir`.
- Fuera de alcance: las 17 filas de `fiscal.pos_dte39_outbox` y las 2 filas de
  `fiscal.operations` pendientes. Este procedimiento no las lee, reclama ni modifica.

## Prerrequisitos (todos verificados fuera de este documento)
1. OpenAPI de DTECore verificado. El código asume que el XML/PDF no vienen inline
   y se tratan como no recuperados hasta confirmar la envoltura de
   `GET /dte/documentos/39/{folio}/{xml|pdf}`.
2. Migración `20261031140000_manual_single_emission_authorization.sql` revisada y
   aplicada **solo** con autorización expresa. Probada en base descartable.
3. Triggers `crm_invoice_paid_pos_dte39_enqueue` y `trg_enqueue_point_fiscal_pilot`
   en `D`. `fiscal.dte39_emission_control.enabled = false` y
   `payment_voucher_policy_approved = false`. Sin workers ni cron fiscales.
4. Entrada verificada de Bonita en `SIISOLUTIONS_PILOT_ISSUERS_JSON` (`verified: true`,
   RUT del operador, API key de producción). Nunca en variables `VITE_`.
5. Certificado digital vigente, CAF con folios disponibles, RUT habilitado para boleta
   (ver `docs/fiscal/` y checklist final).

## Pasos (en orden; cada uno con su propia autorización)
1. **Crear la venta de $100 en efectivo** en el CRM del dueño. Registrar el cobro
   en efectivo recibido por el dueño. Anotar `saleId`.
2. **Crear la autorización de un solo uso** (ejecutada por el operador con
   service-role, nunca desde el navegador):
   ```sql
   insert into public.manual_fiscal_authorizations
     (business_id, sale_id, amount, expires_at, created_by)
   values ('cda904a1-e331-4bd4-9f33-a6715687d3dd', '<saleId>', 100,
           now() + interval '30 minutes', '<dueño user id>')
   returning id;
   ```
   Vence en 30 minutos. Una sola autorización por venta.
3. **Armar la compuerta** solo durante la ventana de emisión, en el entorno del servidor:
   `SIISOLUTIONS_LIVE_SINGLE_EMISSION=armed`,
   `SIISOLUTIONS_LIVE_SINGLE_BUSINESS_ID=<businessId>`,
   `SIISOLUTIONS_LIVE_SINGLE_SALE_ID=<saleId>`. Desarmar al terminar.
4. **Ejecutar una sola vez**:
   ```
   node scripts/fiscal/run-single-live-emission.mjs <businessId> <saleId> <authorizationId> 100 --confirm EMITIR-UNA-BOLETA-<saleId>
   ```
5. **Interpretar el resultado**:
   - `issued`: folio, XML y PDF guardados en `crm_fiscal_issuances`.
   - `unknown` con folio: el proveedor asignó folio pero los documentos no están
     verificados. **No reintentar.** Conciliar manualmente con el folio.
   - `unknown` sin folio: **no reintentar.** Conciliar en el portal de SII Solutions
     con la operación `WLK-<businessId>-<saleId>` antes de cualquier acción.
   - `blocked`: nada se envió. Revisar el motivo. Si el motivo es `BEGIN_OUTCOME_UNKNOWN`,
     verificar en la base si existe la fila de `crm_fiscal_issuances` antes de actuar.
6. **Desarmar la compuerta** y confirmar que `SIISOLUTIONS_LIVE_SINGLE_EMISSION` ya
   no vale `armed`. Revisar el registro en `crm_fiscal_issuances`.

## Reglas que no se negocian
- Nunca reintentar una operación que llegó a `sending`, `unknown` o tuvo folio.
- Nunca usar el sandbox ni una URL distinta de `https://api.siisolutions.cl`.
- Ante cualquier duda, no emitir: la autorización ya quedó consumida.

## Dependencia `crm_fiscal_register_pending`
Este procedimiento **no** la usa. El repositorio de esta ruta solo llama a
`crm_claim_fiscal_issuance` (dentro de `crm_begin_manual_single_emission`) y a
`crm_finalize_fiscal_issuance`. La función sigue siendo necesaria solo para el
barrido de Point, que no forma parte de esta emisión y no debe ejecutarse hasta
aplicar `20261031100000_fiscal_sweep_pending_queue.sql` con autorización.
