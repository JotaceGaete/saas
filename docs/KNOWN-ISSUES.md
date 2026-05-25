# KNOWN-ISSUES.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.

Prioridades: 🔴 Alta / 🟡 Media / 🟢 Baja

---

## Riesgos de seguridad

### 🔴 `backup.sql` expuesto en raíz del repo
- **Archivo:** `/home/user/saas/backup.sql`
- **Riesgo:** Si este archivo contiene un dump real de base de datos, expone datos de usuarios, negocios, claves o hashes en el repositorio (potencialmente indexado por GitHub).
- **Acción:** Verificar si tiene datos sensibles. Si los tiene, rotar credenciales afectadas y eliminar del historial git.

### 🟡 `ordersDoubleFlickerLog.js` de debug en producción
- **Archivo:** `src/pages/orders/ordersDoubleFlickerLog.js`
- **Riesgo:** Archivo de debug interno expuesto en el bundle de producción. Puede revelar detalles internos de implementación.
- **Acción:** Eliminar o convertir en `console.debug` condicional.

### 🟡 Media Service externo con IP directa
- **Config:** `VITE_MEDIA_SERVICE_URL=http://46.225.175.62:3002`
- **Riesgo:** IP directa sin hostname, potencialmente sin SSL (HTTP). Datos de imagen en tránsito sin cifrar. Sin failover.
- **Acción:** Poner detrás de un dominio con HTTPS o confirmar si está obsoleto y eliminarlo.

### 🟡 `src/api/domain-lookup/route.ts` estilo Next.js en proyecto Vite
- **Riesgo:** Archivo con sintaxis App Router de Next.js en un proyecto que NO usa Next.js. Podría ser código muerto ejecutado accidentalmente, o una confusión de contexto.
- **Acción:** Verificar si tiene funcionalidad real o es un remanente.

---

## Bugs probables

### 🔴 Plan expiration en cliente (AuthContext) sin backend enforcement
- **Archivo:** `src/contexts/AuthContext.jsx` líneas 62-69
- **Problema:** Al cargar el negocio, si `planExpiresAt <= now()`, el cliente llama `updateBusiness()` para downgrade a starter. Esto significa que el downgrade lo ejecuta el CLIENTE, no el backend.
- **Riesgo:** Si el cliente no carga (tab cerrada, script bloqueado), el plan no se degrada. Un usuario puede retener acceso a plan Pro indefinidamente si nunca recarga la app.
- **Acción:** Hacer el enforcement de plan en el backend/trigger SQL o en un cron job.

### 🟡 React Router v6.0.2 muy antigua
- **Archivo:** `package.json`
- **Problema:** React Router 6.0.2 es la primera release de v6 (noviembre 2021). La API cambió significativamente en 6.4+ (loaders, actions, `createBrowserRouter`). Cualquier ejemplo o documentación moderna no aplica.
- **Riesgo:** Bugs de comportamiento en edge cases de navegación, `useNavigate`, `useLocation`.
- **Acción:** Planificar upgrade a 6.x actual (6.28+) con cuidado por breaking changes.

### 🟡 Doble sistema de tracking de plan (wa_businesses vs billing_subscriptions)
- **Problema:** `wa_businesses.plan_slug` + `wa_businesses.plan_expires_at` + `wa_businesses.trial_expires_at` Y además `billing_subscriptions.status` + `billing_subscriptions.plan_slug`. Dos fuentes de verdad para el mismo dato.
- **Riesgo:** Inconsistencias entre ambas tablas pueden llevar a que el usuario vea un plan diferente al que realmente tiene.
- **Función:** `wa_get_effective_plan()` intenta reconciliar pero la lógica puede fallar en edge cases.
- **Acción:** Documentar cuál es la fuente de verdad definitiva y eliminar la duplicación gradualmente.

### 🟡 EMAIL_AUTOMATION_ENABLED=false con sistema dual no documentado
- **Problema:** El sistema propio de email (`email_queue`) está deshabilitado. Loops maneja emails. Pero hay templates en `src/emails/` que no es claro si se usan.
- **Riesgo:** Emails de bienvenida, activación 24h o resumen diario pueden no enviarse si Loops no está configurado correctamente.
- **Acción:** Auditar qué emails se envían efectivamente en producción.

---

## Deuda técnica

### 🟡 Billing providers muertos en código
- dLocal: código completo pero deshabilitado. 5+ archivos en `backend/src/services/providers/dlocal/`. Mantener el código agrega complejidad de mantenimiento.
- Paddle: Edge Function y lógica presentes sin activar.
- LemonSqueezy: tabla en migraciones + `docs/LEMONSQUEEZY.md`. Sin código activo aparente.
- **Acción:** O activar o marcar como archivado/eliminar.

### 🟡 Backend Node.js en `/backend/` vs lógica en `/api/`
- Hay duplicación de lógica entre `backend/src/` y `api/*.js`. Las Vercel Functions importan del backend pero no hay un boundary claro.
- **Acción:** Documentar la capa y evitar que la lógica se duplique.

### 🟢 `billing-dlocal-return.txt` suelto
- **Archivo:** `src/pages/billing-dlocal-return/billing-dlocal-return.txt`
- Archivo de texto suelto en directorio de páginas. Probable nota de desarrollo.
- **Acción:** Eliminar.

### 🟢 `api/.data/paypal-catalog.json` y `api/.data/paypal-subscriptions.json`
- Archivos JSON de datos de PayPal en el repositorio. Posible cache de desarrollo.
- **Acción:** Verificar si tienen datos de producción y eliminar del repositorio.

### 🟢 Redux instalado pero uso No confirmado activo
- `@reduxjs/toolkit` en dependencias. No se encontraron slices o stores activos en el código revisado.
- Puede ser un remanente de una refactorización hacia Context API.
- **Acción:** Confirmar si Redux está en uso; si no, eliminar dependencia.

### 🟢 Comentarios de debug en AuthContext
- `console.log('[Auth] state change:', ...)` y múltiples logs condicionales con `window.__AUTH_DEBUG__`.
- Acceptable para debugging pero incrementa noise en producción.

---

## Inconsistencias

### 🟡 `country` (texto) vs `country_code` (ISO) en `wa_businesses`
- La migración base usa `country TEXT` (texto libre). Migración 20260313 añade `country_code TEXT` (ISO 2 letras).
- Negocios antiguos pueden tener `country` sin `country_code`.
- Lógica de billing usa `country_code`; algunos lugares pueden leer `country`.
- **Acción:** Backfill de `country_code` para todos los registros existentes.

### 🟡 `image_url` (singular) vs `images[]` (array) en `wa_products`
- Campo legacy `image_url` coexiste con array `images[]`. El frontend puede leer de uno u otro dependiendo de la versión.
- **Acción:** Migrar todos los productos a `images[]` y deprecar `image_url`.

### 🟢 Múltiples archivos de configuración Vite (`vite.config.js` y `vite.config.mjs`)
- Dos archivos de config Vite en la raíz. Puede causar confusión sobre cuál está activo.
- **Acción:** Eliminar el que no se usa.

---

## Archivos duplicados o legacy

| Archivo | Tipo | Nota |
|---------|------|------|
| `billing-dlocal-return.txt` | Legacy | Texto suelto en páginas |
| `ordersDoubleFlickerLog.js` | Debug | Debería eliminarse |
| `vite.config.mjs` | Duplicado potencial | Coexiste con `vite.config.js` |
| `api/.data/paypal-*.json` | Datos dev | No deberían estar en repo |
| `backup.sql` | Riesgo seguridad | Dump de BD en repo |
| `src/api/domain-lookup/route.ts` | Confuso | Next.js route en proyecto Vite |

---

## Riesgos en producción

### 🔴 Sin staging de Supabase
- Un único proyecto Supabase para producción. Cualquier migración o Edge Function incorrecta afecta usuarios reales.
- **Acción:** Crear proyecto Supabase de staging o usar `supabase db diff` con cuidado.

### 🔴 Plan downgrade gestionado solo en cliente
- Ver "Bugs probables" arriba. Usuario puede tener plan Pro expirado sin ser degradado si no carga la app.

### 🟡 Cron único en Vercel (process-admin-alert-queue)
- Solo un cron job registrado en `vercel.json`. `process-email-queue` no está registrado como cron en Vercel.
- Si el procesamiento de emails depende de ser invocado manualmente, puede haber emails en cola sin procesar.

### 🟡 Vercel preview deployments con misma BD Supabase
- Si los preview deployments usan el mismo `VITE_SUPABASE_URL` que producción, las pruebas en preview afectan datos reales.

---

## Riesgos de performance

### 🟡 Analytics sin paginación confirmada
- `wa_catalog_visits` puede crecer rápidamente. Si la RPC `wa_get_business_visit_stats()` no usa índices correctamente en tablas grandes, puede ser lenta.
- Índice `(business_id, visitor_id, created_at DESC)` existe pero las queries deben verificarse.

### 🟡 Imágenes: array `images[]` sin lazy loading garantizado
- Productos con múltiples imágenes cargan todo el array. No confirmado si hay lazy loading implementado en el catálogo público.

### 🟢 Bundle size
- `d3@7`, `framer-motion@10`, `recharts@2` son librerías pesadas. No confirmado si hay code splitting activo por ruta.
- Vite hace code splitting automático, pero validar que el bundle inicial sea razonable.
