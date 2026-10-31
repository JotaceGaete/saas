# Estado previo a la aplicación de migraciones (2026-10-31)

Proyecto `hxxdketymcntadffmajf`. Capturado en solo lectura inmediatamente antes de aplicar.

## Función reemplazada: `public.crm_finalize_fiscal_issuance`

- md5 de `pg_get_functiondef`: `9275cb3fc4c2017268f9ef5f02eedae3`
  (coincide con el snapshot del 2026-10-31: sin drift desde entonces).
- Definición completa (verbatim):

```sql
CREATE OR REPLACE FUNCTION public.crm_finalize_fiscal_issuance(p_business_id uuid, p_sale_id uuid, p_operation_id text, p_status text, p_folio integer DEFAULT NULL::integer, p_xml_base64 text DEFAULT NULL::text, p_pdf_base64 text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_count integer; begin if p_status is null or p_status not in ('issued','unknown') or (p_folio is not null and p_folio<=0) or (p_status='issued' and (p_folio is null or nullif(p_xml_base64,'') is null or nullif(p_pdf_base64,'') is null)) then raise exception 'Invalid fiscal outcome'; end if; update public.crm_fiscal_issuances set status=p_status,folio=p_folio,xml_base64=case when p_status='issued' then p_xml_base64 else null end,pdf_base64=case when p_status='issued' then p_pdf_base64 else null end,updated_at=now() where business_id=p_business_id and sale_id=p_sale_id and operation_id=p_operation_id and status='sending' and provider='siisolutions' and dte_type=39; get diagnostics v_count=row_count; return v_count=1; end; $function$
```

Diferencias conocidas entre la nueva y la actual: solo el mensaje de error
(`Invalid fiscal folio` / `Issued outcome requires folio, XML and PDF` en vez de
`Invalid fiscal outcome`). La lógica de estados, filtros y escrituras es la misma.

## Objetos nuevos (no deben existir antes)

- `public.crm_begin_manual_single_emission(...)`: no existe.
- `public.manual_fiscal_authorizations`: no existe.
- `public.fiscal_test_sales`: no existe.

## Huella de operaciones existentes (no deben cambiar)

| Objeto | Valor |
|---|---|
| `fiscal.pos_dte39_outbox` | 17 filas, todas `pending`. Huella de id, estado, folio y attempts: `35225cee0f53d4cc2eddb1b061870ee8` |
| `fiscal.pos_dte39_outbox` (conteo por estado) | `pending:17`. md5 `0db9db5f01257dcff0cff76643a74fa5` |
| `fiscal.operations` | 2 filas, todas `pending`. md5 de conteo por estado `1ba88ddbefcf4ec16acc17a9c8a57275` |
| `public.crm_fiscal_issuances` con `sending` o `unknown` | 0 |
| `fiscal.dte39_emission_control` | `enabled = false`, `payment_voucher_policy_approved = false` |
| Triggers `crm_invoice_paid_pos_dte39_enqueue` y `trg_enqueue_point_fiscal_pilot` | `D` y `D` |

## Compatibilidad verificada (solo lectura)

- `crm_claim_fiscal_issuance(uuid,uuid,text,integer)` existe, mismo cuerpo que el repo.
- `crm_invoices` tiene índice único `(id, business_id)`: requerido por las claves foráneas nuevas.
- `wa_businesses` tiene `user_id`, `country_code` y `currency`.
- `crm_cash_sessions`: índice único parcial `uq_crm_cash_sessions_one_open_per_business`.

## Evidencia posterior a la aplicación (2026-10-31)

Migraciones aplicadas en producción, en orden, con `apply_migration` y sin reparación de historial:

1. `20261031140000_manual_single_emission_authorization`: OK.
2. `20261031150000_fiscal_test_sale_marks`: OK.

Verificación posterior (solo lectura):

| Objeto | Resultado |
|---|---|
| `crm_begin_manual_single_emission` | existe (1) |
| `manual_fiscal_authorizations` | existe, 0 filas |
| `fiscal_test_sales` | existe, RLS activo, 0 filas |
| `crm_finalize_fiscal_issuance` md5 | `019d988004dbc0e4e6ef18332f60c866` (antes `9275cb3f…`; solo cambian los textos de error) |
| Triggers de enqueue | `D` y `D` |
| `fiscal.dte39_emission_control` | `enabled=false`, `payment_voucher_policy_approved=false` |
| `fiscal.pos_dte39_outbox` | 17 `pending` (sin cambios) |
| `fiscal.operations` | 2 `pending` (sin cambios) |
| `crm_fiscal_issuances` `sending`/`unknown` | 0 |
| Caja abierta de Bonita | 0 |

Nota: la huella de outbox del paso previo usó otra fórmula; la comparación válida es por conteo y estado.

Pendiente: abrir la caja "PRUEBA TÉCNICA SII — NO COMERCIAL", cerrarla y después abrir la comercial. El runner no se ha ejecutado, no se ha creado ninguna fila de autorización y no se ha enviado nada a DTECore. `fiscal.issuers` no fue modificado.
