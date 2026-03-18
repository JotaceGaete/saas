# Integración LemonSqueezy - Ventalink

Documentación de la integración LemonSqueezy para cobrar en USD a usuarios internacionales (Argentina, resto del mundo). Chile sigue usando Mercado Pago.

## Regla de negocio

- **`country === 'CL'`** → Mercado Pago (CLP)
- **`country !== 'CL'`** → LemonSqueezy (USD), incluye Argentina

## Variables de entorno

### Supabase Edge Functions (secrets)

```bash
# LemonSqueezy API
LEMONSQUEEZY_API_KEY=your_api_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_SIGNING_SECRET=your_webhook_signing_secret

# Variantes de producto (IDs de LemonSqueezy)
LEMONSQUEEZY_VARIANT_PRO_ID=12345
LEMONSQUEEZY_VARIANT_BUSINESS_ID=67890
```

### Configurar secrets en Supabase

```bash
supabase secrets set LEMONSQUEEZY_API_KEY=xxx
supabase secrets set LEMONSQUEEZY_STORE_ID=xxx
supabase secrets set LEMONSQUEEZY_SIGNING_SECRET=xxx
supabase secrets set LEMONSQUEEZY_VARIANT_PRO_ID=xxx
supabase secrets set LEMONSQUEEZY_VARIANT_BUSINESS_ID=xxx
```

## Archivos creados / modificados

### Creados
- `supabase/migrations/20260319000000_wa_subscriptions_lemonsqueezy.sql`
- `supabase/functions/create-lemonsqueezy-checkout/index.ts`
- `supabase/functions/lemonsqueezy-webhook/index.ts`
- `src/pages/billing/BillingSuccessPage.jsx`
- `src/pages/billing/BillingCancelPage.jsx`
- `docs/LEMONSQUEEZY.md`

### Modificados
- `src/config/paymentProvider.js` – provider `lemonsqueezy` para no-CL
- `src/constants/plans.js` – `getPlanPriceByCountry` prioriza lemonsqueezy → USD
- `src/pages/plans/index.jsx` – flujo LemonSqueezy (reemplaza Paddle)
- `supabase/functions/plan-change-preview/index.ts` – soporte provider `lemonsqueezy`
- `src/Routes.jsx` – rutas `/billing/success` y `/billing/cancel`
- `supabase/config.toml` – verify_jwt=false para nuevas Edge Functions

## Mapeo de planes

| plan_slug | LemonSqueezy Variant ID |
|-----------|-------------------------|
| pro       | LEMONSQUEEZY_VARIANT_PRO_ID |
| business  | LEMONSQUEEZY_VARIANT_BUSINESS_ID |

## Pasos para probar localmente

1. **Migración**
   ```bash
   supabase db push
   # o: supabase migration up
   ```

2. **Secrets (desarrollo)**
   Crea `.env.local` o usa Supabase Dashboard → Edge Functions → Secrets.

3. **Desplegar Edge Functions**
   ```bash
   supabase functions deploy create-lemonsqueezy-checkout
   supabase functions deploy lemonsqueezy-webhook
   ```

4. **Webhook LemonSqueezy**
   - Dashboard LemonSqueezy → Settings → Webhooks
   - URL: `https://<tu-proyecto>.supabase.co/functions/v1/lemonsqueezy-webhook`
   - Signing Secret: el mismo que `LEMONSQUEEZY_SIGNING_SECRET`
   - Eventos: `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_success`, `subscription_payment_failed`, `subscription_expired`

5. **Frontend local**
   - Simula país no-CL (cambia `country_code` en business o usa go.ventalink.app)
   - Ve a /planes → elige Pro o Full
   - Debería mostrar precios en USD y abrir checkout LemonSqueezy

## Probar webhook con LemonSqueezy

1. **Test mode**: LemonSqueezy envía eventos de prueba si el webhook está en test mode.
2. **Reenvío manual**: En LemonSqueezy → Webhooks → ver eventos recientes → "Resend".
3. **Ngrok / tunneling**:
   ```bash
   ngrok http 54321
   # Usa la URL ngrok en el webhook temporal para desarrollo
   ```

## URLs de redirección

- **Éxito**: `https://go.ventalink.app/billing/success` → redirige a `/planes`
- **Cancelación**: `https://go.ventalink.app/billing/cancel` → muestra "Pago cancelado"

## Checklist final

- [ ] Migración `wa_subscriptions` y `wa_subscription_events` aplicada
- [ ] Secrets configurados en Supabase
- [ ] Edge Functions desplegadas
- [ ] Webhook configurado en LemonSqueezy
- [ ] Productos/variantes creados en LemonSqueezy (Pro, Business)
- [ ] Variant IDs correctos en secrets
- [ ] Prueba de checkout con tarjeta de test
- [ ] Verificar que el webhook actualiza `wa_businesses` y `wa_subscriptions`
- [ ] Chile sigue usando Mercado Pago sin cambios
