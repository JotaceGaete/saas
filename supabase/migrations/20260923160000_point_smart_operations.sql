-- ============================================================
-- POINT-SMART-2-3 — persistencia segura de operaciones Mercado Pago Point
--
-- Esta migración crea el ledger operativo que vive ENTRE el intento de
-- cobro físico y la venta CRM definitiva.
--
-- Regla de dominio:
--   - una operación Point NO es una venta Walinka;
--   - crm_invoice_id permanece NULL mientras Mercado Pago no confirme
--     status='processed';
--   - esta tabla NO descuenta stock, NO crea crm_payments y NO mueve caja.
--
-- La finalización de la venta se implementará en una fase posterior sobre
-- crm_create_pos_sale(), conservando su atomicidad e idempotencia actuales.
--
-- Seguridad:
--   - tabla server-side only;
--   - RLS habilitado;
--   - sin acceso directo PUBLIC/anon/authenticated;
--   - las Edge Functions Point usarán service_role después de autenticar al
--     usuario y resolver/revalidar su business_id.
-- ============================================================

CREATE TABLE public.crm_pos_point_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id UUID NOT NULL
    REFERENCES public.wa_businesses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Caja abierta capturada al INICIAR el cobro. La venta procesada debe
  -- finalizar contra ESTA caja; nunca contra "la caja que esté abierta"
  -- después de un corte/reapertura.
  cash_session_id UUID NOT NULL
    REFERENCES public.crm_cash_sessions(id) ON DELETE RESTRICT,

  terminal_id TEXT NOT NULL,

  -- Identificadores devueltos por Mercado Pago. mp_order_id nace NULL
  -- porque la fila local se crea antes de enviar POST /v1/orders.
  mp_order_id TEXT,
  mp_payment_id TEXT,

  -- Correlación Walinka <-> Mercado Pago. Nunca contiene datos sensibles.
  external_reference TEXT NOT NULL,

  -- Idempotencia EXCLUSIVA de creación de la order Point. Es distinta de
  -- crm_invoices.pos_idempotency_key, que protege la creación de la venta.
  create_idempotency_key UUID NOT NULL,
  -- Clave estable separada para POST /v1/orders/{id}/cancel. Se genera
  -- server-side y permite reintentar una cancelación sin duplicar efectos.
  cancel_idempotency_key UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Se reserva desde el inicio la clave de venta para que una recuperación
  -- tras corte de red finalice SIEMPRE el mismo intento de crm_create_pos_sale.
  sale_idempotency_key TEXT NOT NULL,

  -- Snapshot inmutable de la intención de venta validada por el backend.
  -- Permite recuperar/finalizar exactamente la venta que originó el cobro
  -- incluso si el navegador se cierra. No contiene secretos de MP.
  sale_snapshot JSONB NOT NULL,

  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL,

  -- Estado real de Orders API. 'creating' es el único estado local: existe
  -- durante la ventana entre persistir el intento y recibir la respuesta de
  -- Mercado Pago. El resto replica el vocabulario de Orders.
  mp_status TEXT NOT NULL DEFAULT 'creating',
  mp_status_detail TEXT,

  crm_invoice_id UUID
    REFERENCES public.crm_invoices(id) ON DELETE SET NULL,

  processed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT crm_pos_point_operations_terminal_not_blank
    CHECK (btrim(terminal_id) <> ''),
  CONSTRAINT crm_pos_point_operations_external_reference_not_blank
    CHECK (btrim(external_reference) <> ''),
  CONSTRAINT crm_pos_point_operations_sale_key_not_blank
    CHECK (btrim(sale_idempotency_key) <> '' AND length(sale_idempotency_key) <= 200),
  CONSTRAINT crm_pos_point_operations_sale_snapshot_object
    CHECK (jsonb_typeof(sale_snapshot) = 'object'),
  CONSTRAINT crm_pos_point_operations_amount_positive
    CHECK (amount > 0),
  CONSTRAINT crm_pos_point_operations_currency_format
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT crm_pos_point_operations_status_check
    CHECK (mp_status IN (
      'creating',
      'created',
      'at_terminal',
      'processed',
      'failed',
      'action_required',
      'expired',
      'canceled',
      'refunded'
    )),
  CONSTRAINT crm_pos_point_operations_processed_timestamp_check
    CHECK (processed_at IS NULL OR mp_status IN ('processed', 'refunded')),
  CONSTRAINT crm_pos_point_operations_finalized_invoice_check
    CHECK (finalized_at IS NULL OR crm_invoice_id IS NOT NULL)
);

-- Idempotencia de creación del cobro: una key no puede generar dos intentos
-- dentro del mismo negocio.
CREATE UNIQUE INDEX crm_pos_point_operations_create_idempotency_uq
  ON public.crm_pos_point_operations (business_id, create_idempotency_key);

-- Correlación estable generada por Walinka. Acotada por tenant por defensa
-- adicional aunque el generador use UUID.
CREATE UNIQUE INDEX crm_pos_point_operations_external_reference_uq
  ON public.crm_pos_point_operations (business_id, external_reference);

-- Mercado Pago order id solo existe después de crear la order. UNIQUE parcial
-- permite múltiples intentos todavía en estado 'creating' con NULL.
CREATE UNIQUE INDEX crm_pos_point_operations_mp_order_uq
  ON public.crm_pos_point_operations (mp_order_id)
  WHERE mp_order_id IS NOT NULL;

-- Una venta CRM solo puede quedar enlazada a una operación Point.
CREATE UNIQUE INDEX crm_pos_point_operations_invoice_uq
  ON public.crm_pos_point_operations (crm_invoice_id)
  WHERE crm_invoice_id IS NOT NULL;

-- La misma clave de venta no puede pertenecer a dos operaciones Point del
-- mismo negocio. Complementa el índice ya existente en crm_invoices.
CREATE UNIQUE INDEX crm_pos_point_operations_sale_idempotency_uq
  ON public.crm_pos_point_operations (business_id, sale_idempotency_key);

-- Recuperación rápida de cobros no finalizados al reabrir el TPV.
CREATE INDEX crm_pos_point_operations_pending_idx
  ON public.crm_pos_point_operations (business_id, created_at DESC)
  WHERE crm_invoice_id IS NULL
    AND mp_status IN ('creating', 'created', 'at_terminal', 'processed', 'action_required');

-- Búsqueda de historial/diagnóstico por terminal.
CREATE INDEX crm_pos_point_operations_terminal_idx
  ON public.crm_pos_point_operations (business_id, terminal_id, created_at DESC);

CREATE INDEX crm_pos_point_operations_cash_session_idx
  ON public.crm_pos_point_operations (cash_session_id, created_at DESC)
  WHERE crm_invoice_id IS NULL;

CREATE TRIGGER crm_pos_point_operations_updated_at
  BEFORE UPDATE ON public.crm_pos_point_operations
  FOR EACH ROW EXECUTE FUNCTION public.wa_set_updated_at();

ALTER TABLE public.crm_pos_point_operations ENABLE ROW LEVEL SECURITY;

-- Doble barrera intencional: no se crean policies de cliente y además se
-- revocan privilegios directos. El navegador nunca consulta ni modifica este
-- ledger; las futuras Edge Functions Point son la única puerta de entrada.
REVOKE ALL ON TABLE public.crm_pos_point_operations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.crm_pos_point_operations IS
  'POINT-SMART-2-3: ledger server-side de intentos de cobro físico Mercado Pago Point. Vive antes de crm_create_pos_sale: no crea venta, caja, pago CRM ni stock por sí solo. Una operación solo puede enlazarse a crm_invoices después de confirmarse y finalizarse de forma idempotente. Sin acceso directo desde browser.';

COMMENT ON COLUMN public.crm_pos_point_operations.mp_status IS
  'Estado de Orders API de Mercado Pago. creating es un estado local transitorio previo a recibir mp_order_id; created/at_terminal/processed/failed/action_required/expired/canceled/refunded replican estados Point manejados por Walinka. Solo processed habilitará la finalización automática de la venta en la fase siguiente.';

COMMENT ON COLUMN public.crm_pos_point_operations.create_idempotency_key IS
  'UUID usado como X-Idempotency-Key al crear la order Point. No reutilizar como pos_idempotency_key de crm_create_pos_sale.';

COMMENT ON COLUMN public.crm_pos_point_operations.sale_idempotency_key IS
  'Clave reservada para crm_create_pos_sale desde el inicio del intento Point. Permite recuperar un cobro processed tras un corte sin crear dos ventas.';

COMMENT ON COLUMN public.crm_pos_point_operations.crm_invoice_id IS
  'NULL mientras el cobro Point no haya sido finalizado como venta CRM. Se enlaza una sola vez después de confirmar status=processed y ejecutar la finalización idempotente.';

COMMENT ON COLUMN public.crm_pos_point_operations.sale_snapshot IS
  'Snapshot validado de items/descuento/cliente/notas/fecha usado para crear y posteriormente finalizar la venta Point. El monto cobrado se calcula server-side desde este snapshot; nunca se acepta un total del browser.';

COMMENT ON COLUMN public.crm_pos_point_operations.cancel_idempotency_key IS
  'X-Idempotency-Key estable y server-side para cancelar la order Point. Distinta de la key usada al crear el cobro.';

COMMENT ON COLUMN public.crm_pos_point_operations.cash_session_id IS
  'Caja abierta capturada al crear el cobro Point. Evita atribuir un pago aprobado a otra caja después de un cierre/reapertura y permite bloquear el cierre mientras exista una operación Point pendiente.';
