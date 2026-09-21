-- SEGURIDAD-WALINKA-1C — RLS + revoke de privilegios cliente en 4 tablas
-- internas de infraestructura de billing/lifecycle que nunca fueron
-- diseñadas para ser accedidas directamente por anon/authenticated.
--
-- Tablas cubiertas (únicas cuatro que toca esta migración):
--   - public.billing_subscriptions
--   - public.billing_webhook_events
--   - public.paypal_webhook_events
--   - public.wa_lifecycle_events (+ su vista public.wa_lifecycle_events_pending)
--
-- Hallazgo (auditoría SEGURIDAD-WALINKA-1, continuada en 1C): ninguna de
-- las cuatro tiene relrowsecurity, políticas, ni GRANT/REVOKE versionado
-- en ninguna migración desde su creación. Bajo los privilegios por defecto
-- que Supabase aplica a las tablas del schema public (ALTER DEFAULT
-- PRIVILEGES fuera de las migraciones versionadas), esto significa que
-- anon/authenticated heredan SELECT/INSERT/UPDATE/DELETE completos salvo
-- que se revoquen explícitamente -- exactamente lo que hace esta migración.
--
-- Grafo de consumidores reales (ver informe SEGURIDAD-WALINKA-1C para el
-- detalle completo; resumen de por qué es seguro cerrar anon/authenticated
-- en las cuatro):
--
--   billing_subscriptions:
--     - INSERT/UPSERT: backend/src/services/billing/billingSubscriptionService.js,
--       backend/src/services/subscriptions/syncService.js y
--       backend/src/services/providers/dlocal/checkoutService.js, todos
--       sobre billingSubscriptionRepository.js (service_role). El trigger
--       de signup (wa_handle_new_user_business(), baseline 20260807120000)
--       ya NO inserta en billing_subscriptions -- solo crea wa_businesses;
--       esa fila se crea más tarde, server-side, cuando el negocio elige
--       un plan/proveedor de pago.
--     - UPDATE: función wa_enforce_expired_plans() (SECURITY DEFINER,
--       invocada vía RPC con service_role desde apply-scheduled-plan-changes).
--     - UPSERT/SELECT: backend/src/repositories/billingSubscriptionRepository.js
--       y supabase/functions/mp-webhook/index.ts -- ambos usan
--       SUPABASE_SERVICE_ROLE_KEY exclusivamente.
--     - Único código frontend que referencia la tabla directamente
--       (src/lib/billing/billingSubscriptionsClient.js, marcado
--       @deprecated) NO está importado/invocado por ninguna ruta viva --
--       el flujo actual usa /api/v1/billing/subscription-state (backend,
--       service_role). No hay ningún consumidor real de anon/authenticated.
--
--   billing_webhook_events / paypal_webhook_events:
--     tablas de idempotencia de webhooks -- su único consumidor en todo el
--     repo son backend/src/repositories/billingWebhookEventRepository.js y
--     paypalWebhookEventRepository.js, ambos con SUPABASE_SERVICE_ROLE_KEY.
--     Cero referencias desde frontend o Edge Functions con anon key.
--
--   wa_lifecycle_events:
--     único INSERT es el trigger wa_queue_first_product_added_lifecycle_event()
--     (SECURITY DEFINER). No existe en el repo ningún consumidor (frontend,
--     Edge Function, cron, worker) que lea la tabla o la vista
--     wa_lifecycle_events_pending -- el comentario original menciona un
--     worker n8n externo, pero no hay credenciales/rol de n8n visibles
--     desde este repositorio. Ver informe: si n8n necesitara leer esta
--     cola, el diseño correcto es autenticarlo con service_role (nunca con
--     la anon key pública), así que cerrar anon/authenticated es la opción
--     de mínimo privilegio -- no rompe ningún flujo confirmado.
--
-- Ninguna de las cuatro necesita políticas RLS con USING/CHECK: todo su
-- acceso legítimo es service_role (con BYPASSRLS) o funciones SECURITY
-- DEFINER propiedad de postgres (RLS no se aplica al owner de la tabla
-- salvo FORCE ROW LEVEL SECURITY, que esta migración NO activa a
-- propósito). Por eso "ENABLE ROW LEVEL SECURITY" sin políticas + REVOKE
-- explícito es suficiente y no requiere CREATE POLICY.

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_subscriptions FROM PUBLIC, anon, authenticated;

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_webhook_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paypal_webhook_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.wa_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_lifecycle_events FROM PUBLIC, anon, authenticated;

-- La vista wa_lifecycle_events_pending (20260520090000) es SECURITY
-- INVOKER por defecto en su definición, pero el punto de control real es
-- el GRANT de la vista misma: sin este REVOKE, anon/authenticated podrían
-- seguir leyendo la cola completa a través de la vista aunque la tabla
-- base ya esté cerrada.
REVOKE ALL ON public.wa_lifecycle_events_pending FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.billing_subscriptions IS
  'Estado normalizado de suscripciones para billing multi-provider (PayPal, dLocal, etc.). Solo service_role / funciones SECURITY DEFINER -- sin acceso anon/authenticated (SEGURIDAD-WALINKA-1C).';

COMMENT ON TABLE public.billing_webhook_events IS
  'Idempotencia de webhooks de billing (dLocal, etc.). Solo service_role -- sin acceso anon/authenticated (SEGURIDAD-WALINKA-1C).';

COMMENT ON TABLE public.paypal_webhook_events IS
  'Idempotencia de webhooks de PayPal. Solo service_role -- sin acceso anon/authenticated (SEGURIDAD-WALINKA-1C).';

COMMENT ON TABLE public.wa_lifecycle_events IS
  'Cola de eventos de lifecycle para automatización externa. Solo service_role / trigger SECURITY DEFINER -- sin acceso anon/authenticated (SEGURIDAD-WALINKA-1C).';

NOTIFY pgrst, 'reload schema';
