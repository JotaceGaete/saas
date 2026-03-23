# Lemon Squeezy — retirado

La integración con Lemon Squeezy fue **eliminada del código**. Los planes fuera de Chile usan **activación manual** (contacto por WhatsApp) hasta conectar otro proveedor.

- Configuración actual: `VITE_PLANS_SUPPORT_WHATSAPP` en `.env.example`
- Edge functions `create-lemonsqueezy-checkout` y `lemonsqueezy-webhook` ya no existen en el repo
- Tablas `wa_subscriptions` / `wa_subscription_events` pueden seguir usándose con otro proveedor (no borrar sin migración)
