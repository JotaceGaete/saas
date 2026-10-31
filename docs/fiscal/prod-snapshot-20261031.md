# Snapshot de solo lectura: infraestructura fiscal en producción

- Proyecto Supabase: `hxxdketymcntadffmajf` (Postgres 16, managed)
- Fecha de captura: 2026-10-31
- Método: consultas `SELECT` de solo lectura sobre `pg_proc`, `pg_trigger`, `pg_class`, `pg_policies`, `information_schema.columns` y `list_migrations`.
- Alcance: funciones, triggers, columnas, RLS, políticas y migraciones fiscales.
- Sin valores de secretos, sin filas de datos, sin credenciales. Los hashes son `md5` de la definición (`pg_get_functiondef`, `pg_get_triggerdef`, lista de columnas `nombre tipo`).
- Este archivo no reemplaza una migración. Es evidencia para auditar drift entre producción y el repositorio.

## 1. Funciones fiscales (owner, SECURITY DEFINER, md5 de definición)

| Esquema | Función | Args | Owner | SECURITY DEFINER | md5 |
|---|---|---|---|---|---|
| fiscal | enqueue_paid_pos_dte39 | () | postgres | sí | 922ec4f59f1df8d0a61df4c541c450fe |
| fiscal | dte39_evidence_append_only | () | postgres | no | 5d7d17b6584c21b734a3faee5ba353a3 |
| fiscal | protect_dte39_outbox_transition | () | postgres | no | 06e356263fd116b02d7e7da870c17a61 |
| public | crm_claim_fiscal_issuance | (p_business_id uuid, p_sale_id uuid, p_operation_id text, p_dte_type integer) | postgres | no | d49b7552bc35e3bfde27a87b40a48caa |
| public | crm_finalize_fiscal_issuance | (p_business_id uuid, p_sale_id uuid, p_operation_id text, p_status text, p_folio integer, p_xml_base64 text, p_pdf_base64 text) | postgres | no | 9275cb3fc4c2017268f9ef5f02eedae3 |
| public | crm_reconcile_fiscal_issuance | (p_business_id uuid, p_sale_id uuid, p_operation_id text, p_folio integer, p_xml_base64 text, p_pdf_base64 text) | postgres | no | 4a903525204952f3c0ca7e63b65f2d06 |
| public | crm_claim_point_fiscal_pilot | (p_limit integer) | postgres | sí | 9845dcb74a3a12763ba539e25d9cf6b8 |
| public | crm_complete_point_fiscal_pilot | (p_id uuid, p_status text, p_error_code text) | postgres | sí | ee9409a6200ed3d4152013df396d687a |
| public | crm_enqueue_point_fiscal_pilot | () | postgres | sí | aa8e99fb1935d8bcf582a540f75d9212 |
| public | sii_pilot_begin_submission | (p_operation_id uuid) | postgres | sí | 54aa9d9b884921a7b77cdf8018651f41 |
| public | sii_pilot_claim_operation | (p_business_id uuid, p_sale_id uuid) | postgres | sí | 0dd4782969241e6c00cad626b85d1d4e |
| public | sii_pilot_fiscal_status | (p_business_id uuid, p_sale_id uuid) | postgres | sí | 8a0daa86c7819213bc4bab9e6d2eae7a |
| public | sii_pilot_preflight_sale | (p_business_id uuid, p_sale_id uuid) | postgres | sí | 793ef0513c562c1b9caceebe6a2a03ea |
| public | sii_pilot_record_provider_result | (p_operation_id uuid, p_result text, p_folio bigint, p_provider_response_id text, p_error_code text) | postgres | sí | 728c0fa21ebc9f9aa025ddbaf9f7b138 |
| public | sii_pilot_tax_mapping_status | (p_business_id uuid, p_sale_id uuid) | postgres | sí | 5f94104f1235ad9bb44fa312c1cf4323 |
| public | sii_pilot_verify_line_tax | (p_business_id uuid, p_sale_id uuid, p_invoice_item_id uuid, p_category text, p_evidence text) | postgres | sí | 8b4c50a95d82e619ec672406743b82f7 |
| public | sii_pos_dte39_claim_next | () | postgres | sí | 362181c3b022d8098dfeb870d4a64b09 |
| public | sii_pos_dte39_finish | (p_job_id uuid, p_state text, p_folio bigint, p_response jsonb, p_error text) | postgres | sí | 9bb2d55103aa8be8a606b3feca148a0a |
| public | sii_pos_dte39_job_snapshot | (p_job_id uuid) | postgres | sí | c2ce86723c05a83a5835c4413dd7713a |
| public | sii_pos_dte39_reconciliation_queue | (p_limit integer) | postgres | sí | 571c8bffc668856a433369dedeab3e0b |
| public | sii_pos_dte39_record_evidence | (p_job_id uuid, p_operation_id text, p_reviewer text, p_checked_at timestamptz, p_status text, p_folio bigint, p_reference text) | postgres | sí | 0b331c9d0912e058fba5dfcac6ef1de2 |
| public | sii_pos_dte39_evidence_history | (p_job_id uuid) | postgres | sí | 97bf06941033e931f1aa05057df6b957 |

## 2. Triggers de encolado y de protección fiscal (tgenabled: O = activo, D = deshabilitado)

| Tabla | Trigger | Estado antes | Función | md5 de triggerdef |
|---|---|---|---|---|
| public.crm_invoices | crm_invoice_paid_pos_dte39_enqueue | O | fiscal.enqueue_paid_pos_dte39() | 449086dd1e9f5c082cc4acdab19e7352 |
| public.crm_pos_point_operations | trg_enqueue_point_fiscal_pilot | O | public.crm_enqueue_point_fiscal_pilot() | d38ccf1af5dcc6e4156a50d6e9b9c8e6 |
| fiscal.pos_dte39_outbox | protect_dte39_outbox_transition | O | fiscal.protect_dte39_outbox_transition() | a44ae3b30f48a01455c843f7f214ad8e |
| fiscal.dte39_reconciliation_evidence | dte39_evidence_append_only | O | fiscal.dte39_evidence_append_only() | f9474dcf5272106bc578bc9588c089ae |

Los demás triggers de los esquemas `public` y `fiscal` (de la lista completa) llaman a funciones de `updated_at`, auditoría o negocio no fiscal. No se encontró ningún otro trigger que llame a funciones de emisión DTE.

## 3. Columnas (tipo y hash de la lista ordenada)

| Esquema.tabla | Columnas | md5 |
|---|---|---|
| fiscal.pos_dte39_outbox | id uuid, business_id uuid, invoice_id uuid, document_type smallint, operation_id text, state text, folio bigint, provider_response jsonb, last_error text, attempts integer, claimed_at timestamptz, created_at timestamptz, updated_at timestamptz | 5fe780807aa8d0a3e64642305f296e57 |
| fiscal.operations | id uuid, business_id uuid, sale_id uuid, issuer_rut text, document_type smallint, operation_key text, status text, folio bigint, provider_response_id text, error_code text, snapshot jsonb, created_at timestamptz, updated_at timestamptz | 89eecba75018a04e176ae40c6bc5e408 |
| fiscal.dte39_emission_control | singleton boolean, enabled boolean, payment_voucher_policy_approved boolean, updated_at timestamptz | 8e0840dbf61e252e29337cb0573a0b09 |
| fiscal.issuers | business_id uuid, issuer_rut text, provider text, enabled boolean, verified boolean, created_at timestamptz, updated_at timestamptz | 1dad6a32983f3f5d7d7f66a47ac3f4ea |
| fiscal.business_tax_defaults | business_id uuid, default_is_exempt boolean, confirmed_by_owner boolean, confirmed_at timestamptz, updated_at timestamptz | 114b94b97cba142ca8e7b8333ce8e933 |
| fiscal.line_tax_verifications | id uuid, business_id uuid, sale_id uuid, invoice_item_id uuid, category text, verified boolean, evidence text, verified_at timestamptz, created_at timestamptz, line_fingerprint text | 13d6cbeeaa76cd476eb9ad11bb4728c1 |
| fiscal.dte39_reconciliation_evidence | id uuid, job_id uuid, operation_id text, reviewer text, checked_at timestamptz, provider_status text, provider_folio bigint, evidence_reference text, created_at timestamptz | 8f277148f15c046282a9d87225e0a4f3 |
| public.crm_fiscal_issuances | id uuid, business_id uuid, sale_id uuid, provider text, dte_type integer, operation_id text, status text, folio integer, xml_base64 text, pdf_base64 text, error_code text, created_at timestamptz, updated_at timestamptz | bfedddf97a8f867f6ced8fb9b97f7150 |
| public.crm_point_fiscal_outbox | id uuid, point_operation_id uuid, business_id uuid, sale_id uuid, status text, attempts integer, last_error_code text, created_at timestamptz, updated_at timestamptz | 3b5227bd7a2d7ddf9284fb3451494726 |
| public.crm_invoices | (25 columnas; incluye status, paid_at, source, total, pos_idempotency_key) | ba9c0a8bb8830fac1168dff3d33a029c |
| public.crm_pos_point_operations | (20 columnas; incluye mp_order_id, mp_payment_id, mp_status, crm_invoice_id, finalized_at) | 831c4f2ce1051b2f17678433022282c1 |

Sin datos. Los valores de `xml_base64` y `pdf_base64` nunca se consultaron.

## 4. RLS y políticas

- Todas las tablas fiscales listadas tienen `relrowsecurity = true` y `relforcerowsecurity = false`. Owner: postgres.
- Tablas revisadas: `fiscal.business_tax_defaults`, `fiscal.dte39_emission_control`, `fiscal.dte39_reconciliation_evidence`, `fiscal.issuers`, `fiscal.line_tax_verifications`, `fiscal.operations`, `fiscal.pos_dte39_outbox`, `public.crm_fiscal_issuances`, `public.crm_point_fiscal_outbox`, `public.crm_pos_point_operations`, `public.crm_pos_point_stock_reservations`.
- Número de políticas en `pg_policies` para esas tablas: **0**. Con RLS activo y sin políticas, los roles `anon` y `authenticated` no leen ni escriben. `service_role` y `postgres` sí pueden (BYPASSRLS / owner).
- Consecuencia: el acceso efectivo depende de los GRANT y de las funciones `SECURITY DEFINER` con `EXECUTE` solo para `service_role`.

## 5. Migraciones fiscales aplicadas en producción vs repositorio

Estado en `main` (origin/main, 227 archivos). Estado en `feat/boleta-auto-emision-20261030` (PR #97, HEAD 812975d).

Coinciden por nombre con archivo en la rama de PR #97, pero con **versión distinta**:

| Versión en producción | Nombre | Archivo en feat (PR #97) |
|---|---|---|
| 20261029132822 | restrict_admin_auth_views_20261029 | 20261029143000_restrict_admin_auth_views.sql |
| 20261029135618 | sii_issuance_pilot_20261029 | 20261029110000_sii_issuance_pilot.sql |
| 20261029140056 | sii_manual_reconciliation_20261029 | 20261029160000_sii_manual_reconciliation.sql |

Nota: la versión en producción no coincide con la del archivo, así que el contenido no está verificado como idéntico. La entrada 20261030192220 sii_pending_folio_finalize corresponde por nombre a feat 20261030191500_sii_pending_folio.sql (nombre distinto, no verificado). Registrar el drift con `supabase migration repair` antes de cualquier merge del PR #97 es una decisión del equipo.

Sin archivo en `main` ni en `feat` (27 migraciones aplicadas en producción):

- 20261029165319 fiscal_sii_solutions_pilot_private_registry
- 20261029173832 sii_pilot_private_registry_readonly_status
- 20261029174150 sii_pilot_atomic_claim_no_issuance
- 20261029175012 sii_pilot_provider_result_fail_closed
- 20261029175115 sii_pilot_begin_submission_once_verified
- 20261029180547 sii_pilot_authoritative_sale_preflight_no_emit
- 20261029180831 sii_pilot_private_verified_line_tax_registry
- 20261029181325 sii_pilot_explicit_tax_evidence_write_guard
- 20261029182400 sii_pilot_tax_verification_paid_sale_guard
- 20261029192952 point_fiscal_outbox_pilot
- 20261029192957 point_fiscal_outbox_claim_pilot
- 20261029220036 sii_submission_tax_gate_pilot
- 20261030012131 pos_dte39_outbox
- 20261030012237 pos_dte39_worker_claim
- 20261030013029 enqueue_paid_pos_dte39
- 20261030013426 pilot_tax_default
- 20261030014831 dte39_voucher_policy_gate
- 20261030015636 dte39_snapshot_rpc
- 20261030020142 dte39_claim_cash_only
- 20261030020550 dte39_reconciliation_queue
- 20261030020830 dte39_prevent_unsafe_requeue
- 20261030021040 dte39_reconciliation_evidence
- 20261030021056 dte39_evidence_history
- 20261030145814 dte39_snapshot_issuer_tenant
- 20261030192228 sii_pending_folio_reconcile
- 20261030192220 sii_pending_folio_finalize (feat tiene 20261030191500_sii_pending_folio.sql, nombre distinto; contenido no verificado)

Migración de PR #97 no aplicada en producción: 20261031100000_fiscal_sweep_pending_queue.sql.

Migración de este ops branch, aún no aplicada al momento de capturar este snapshot: 20261031130000_disable_fiscal_enqueue_triggers.sql (ver sección 7).

## 6. Estado de filas (solo conteos y claves, sin valores sensibles)

- `fiscal.pos_dte39_outbox`: 17 filas, todas `state = pending`, `attempts = 0`, sin `claimed_at`, sin `folio`, sin `last_error`. Una fila por factura (17 facturas distintas). Todas del negocio `cda904a1-e331-4bd4-9f33-a6715687d3dd`. Creadas el 2026-10-30. Suma de `crm_invoices.total`: 81000 CLP. Ninguna con entrada en `crm_fiscal_issuances`.
- `fiscal.operations`: 2 filas, `status = pending`, `document_type = 39`, sin folio, sin `error_code`, mismo negocio, creadas el 2026-10-29. Sus `sale_id` no tienen filas en `fiscal.pos_dte39_outbox`.
- `public.crm_point_fiscal_outbox`: 0 filas.
- `fiscal.dte39_emission_control`: singleton, `enabled = false`, `payment_voucher_policy_approved = false`, actualizado 2026-10-30 01:48:31 UTC.

## 7. Migración de desactivación (pendiente de aplicación en este snapshot)

- Archivo: `supabase/migrations/20261031130000_disable_fiscal_enqueue_triggers.sql` (commit 81a9607 en `ops/disable-fiscal-enqueue-triggers`).
- Rollback: `scripts/fiscal/rollback_enable_fiscal_enqueue_triggers.sql`.
- Verificación previa a aplicar: ambos triggers en `O`, definiciones coinciden con la auditoría (secciones 2 y 6).

## 8. Cron y edge functions

- Cron (sin invocación fiscal): expire-trials, send-daily-summary, usuarios-sin-productos, usuarios-inactivos, enforce-expired-plans-hourly, mature-referral-commissions-hourly, process-payment-email-queue, point-reconcile-stale-operations.
- Edge functions: no hay función de emisión DTE desplegada. Presentes las de Point: mp-point-webhook, mp-point-reconcile, mp-point-create-order, mp-point-get-order, mp-point-cancel-order, mp-point-setup-terminal, entre otras.
