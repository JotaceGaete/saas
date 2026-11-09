# Nota de crédito electrónica (DTE 61): diseño (A3)

Estado: **solo diseño, esquema y pruebas simuladas. La emisión real de DTE 61 está bloqueada en la base
(`FISCAL_CREDIT_NOTE_EMISSION_DISABLED`) y en el código (`toProviderCreditNoteBody` lanza
`CONTRACT_NOT_VERIFIED`).**

## Qué permite hoy DTE Core (según su colección oficial)

- `POST /dte/notas-credito/emitir` con `codigoDte: 61`, `idOperacion`, `rutOperador`, `cliente`,
  `detalles`, `medioPago`, `total` y un arreglo `referencias`.
- El ejemplo trae `referencias: []` **vacío**, y la colección no documenta los nombres de los campos de
  una referencia. No se sabe cómo indicar el documento original. **No verificado.**
- Respuesta de ejemplo 200: `folio`, `esSimulacion`, `xmlBase64`, `pdfBase64`, `documentos.*` (igual que
  la boleta). Ejemplos 400: sin folios disponibles y `Cliente.RutReceptor` obligatorio.
- `GET /dte/documentos/{codigoDte}/{folio}/referencias` existe, sin ejemplo de respuesta.
- `GET /dte/notas-credito/folios/resumen`: la NC usa su propio CAF (tipo 61).

## Vínculo con el documento original

Esquema SII de `Referencia` (formato DTE del SII): `TpoDocRef` (tipo del documento referenciado, 39),
`FolioRef`, `FchRef` (fecha del documento original), `CodRef` (1 anula, 2 corrige texto, 3 corrige
montos) y `RazonRef` (hasta 90 caracteres).

En Walinka (migración H):

- `fiscal.credit_notes` guarda la nota con una **clave foránea compuesta al documento exacto**:
  `(original_issuance_id, business_id, issuer_rut, original_folio)` → `crm_fiscal_issuances (id,
  business_id, issuer_rut, folio)`. Una nota no puede apuntar a una boleta de otro comercio, de otro RUT
  ni con otro folio, y esos campos no cambian después de creada.
- `issuer_rut` de la nota = el del original: la emite el mismo contribuyente.
- `public.crm_fiscal_draft_credit_note` (solo service_role, actor con rol `fiscal_owner` o
  `fiscal_reconciler` del negocio) crea un **borrador** con estas reglas:
  - el original debe estar `issued`;
  - CodRef 1 (anula): monto = total de la venta y sin otra nota vigente;
  - CodRef 3 (corrige montos): 0 < monto ≤ saldo no acreditado (suma de notas no fallidas);
  - CodRef 2 (corrige texto): monto 0.
- Folio de la nota: cuando exista emisión, irá al registro `fiscal.document_folios` con `dte_type = 61`
  (único por RUT emisor y tipo, independiente de los folios 39).
- `lib/credit-note.mjs` arma la referencia interna con los nombres SII y valida las mismas reglas.

## Flujo previsto (cuando se habilite)

1. El dueño o un conciliador pide la devolución o anulación de una venta con boleta emitida.
2. Se crea el borrador (estado `draft`) con la referencia y el monto.
3. Emisión con el mismo patrón de la boleta: reclamo atómico `pending → sending` con credenciales y
   verificación de identidad, `idOperacion` determinista (`WLK-NC-<documento>-<n>`), recibo
   write-ahead, `unknown` ante cualquier duda, sin reenvío automático.
4. Con la NC emitida: la boleta original pasa a `cancelled` si CodRef = 1 (el trigger E ya lo permite
   solo como `issued → cancelled`). La venta sigue bloqueada para cambios tributarios.
5. Inventario, caja y cuenta corriente: se ajustan con movimientos nuevos, nunca editando la venta
   original.

## Qué falta para habilitarla (no decidir en código)

- DTE Core: nombres y formato de `referencias`, receptor exigido para una NC de boleta, si admite
  referenciar tipo 39, idempotencia de `idOperacion` (ver CONTRATO-DTECORE.md, pregunta 7).
- Requisitos tributarios (contador o SII): uso de NC sobre boletas (montos, plazos, receptor genérico
  66666666-6 o datos reales del comprador), devolución en efectivo versus a medio de pago original,
  anulación del mismo día versus nota de crédito.
- Una emisión de prueba controlada en ambiente de certificación.
- Una migración posterior que quite el bloqueo `FISCAL_CREDIT_NOTE_EMISSION_DISABLED`.

Pruebas simuladas: `test/unit/credit-note.test.mjs` y la prueba "A3" de
`test/db/lab-multiempresa.db.test.mjs`.
