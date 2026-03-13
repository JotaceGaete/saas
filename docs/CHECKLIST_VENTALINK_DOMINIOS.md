# Checklist: ar.ventalink.app y cl.ventalink.app

Cosas a revisar tras el cambio de nombre/dominios (Vercel ya tiene los dominios).

---

## ✅ Hecho en el repo

- **create-mp-preference**: fallback `APP_BASE_URL` actualizado a `https://cl.ventalink.app` (el front sigue enviando `success_url`/`failure_url`/`pending_url` según el dominio).
- **vite.config.mjs**: `allowedHosts` actualizado a `.ventalink.app`, `ar.ventalink.app`, `cl.ventalink.app` (dev).
- **src/config/appUrl.js** y **.env.example**: comentarios y ejemplos con ventalink.

---

## 1. Supabase

- [ ] **Authentication → URL Configuration**
  - **Site URL**: `https://cl.ventalink.app` (o el dominio principal que uses en emails).
  - **Redirect URLs**: incluir `https://*.ventalink.app`, `https://*.ventalink.app/**` y tu `http://localhost:...` si desarrollas en local.
- [ ] **Edge Functions → Secrets** (opcional): si quieres un fallback por entorno, puedes definir `APP_BASE_URL` (ej. `https://cl.ventalink.app` para un deploy y `https://ar.ventalink.app` para otro). No es obligatorio porque el front envía las URLs.
- [ ] **Plantillas de email** (Authentication → Email Templates): usan la variable `{{ .SiteURL }}`. Comprueba que los enlaces (confirmación, reset password) se vean bien; con Site URL correcto debería bastar.

---

## 2. Vercel

- [ ] **Domains**: `ar.ventalink.app` y `cl.ventalink.app` añadidos y DNS apuntando a Vercel.
- [ ] **Variables de entorno** (por proyecto o por entorno Production/Preview):
  - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (mismo proyecto Supabase para ambos países si es una sola app).
  - `VITE_APP_URL`: **opcional**. Si no la defines, la app usará `window.location.origin` (correcto para ar/cl). Si tienes un deploy por dominio, puedes fijar `VITE_APP_URL=https://ar.ventalink.app` en el deploy de AR y `https://cl.ventalink.app` en el de CL.

---

## 3. Mercado Pago

- [ ] **Webhook**: la URL es la de la Edge Function de Supabase; no depende del dominio del front. No hace falta cambiarla por ventalink.
- [ ] **Redirects**: el front ya envía `success_url`, `failure_url`, `pending_url` con la URL del dominio actual; no hay que configurar nada más en el panel de MP por el cambio de dominio.
- [ ] Si en el futuro usas **una app de MP por país** (AR vs CL): configurar en Supabase Secrets tokens distintos (ej. `MP_ACCESS_TOKEN_AR` / `MP_ACCESS_TOKEN_CL`) y adaptar la función para elegir el token según país o cabecera.

---

## 4. R2 (Cloudflare)

- [ ] Si usas **custom domain** para imágenes (ej. `images.gong.cl`): valorar cambiarlo a algo tipo `images.ventalink.app` y actualizar `R2_PUBLIC_URL` en Supabase Edge Functions.
- [ ] Si aparecen errores **CORS** al cargar imágenes desde `ar.ventalink.app` o `cl.ventalink.app`, en el bucket R2 → Settings → CORS añadir esos orígenes.

---

## 5. Branding y PWA (opcional)

Si quieres que la marca sea “VentALink” en lugar de “Gong”:

- [ ] **index.html**: `<title>`, `meta name="description"`, `apple-mobile-web-app-title`.
- [ ] **public/manifest.json**: `name`, `short_name`, `description`.
- [ ] **docs/PWA_INSTALACION.md** y **DEPLOYMENT_APP_GONG_CL.md**: actualizar ejemplos a ventalink o crear una guía de despliegue para ventalink (ej. `DEPLOYMENT_VENTALINK.md`).

Si mantienes “Gong” como nombre de producto, no hace falta tocar esto.

---

## 6. Documentación interna

- [ ] **DEPLOYMENT_APP_GONG_CL.md**: está centrado en app.gong.cl. Puedes renombrarlo o duplicar como `DEPLOYMENT_VENTALINK.md` y actualizar dominios a ar.ventalink.app / cl.ventalink.app.
- [ ] **docs/R2_IMAGES_SETUP.md** y **supabase/functions/README_MERCADOPAGO.md**: tienen ejemplos con gong.cl; actualizar a ventalink cuando toques esos docs.

---

## 7. Otros

- [ ] **Cookies**: si en el futuro usas cookies con `domain`, asegúrate de que el dominio sea compatible con ambos subdominios (ej. `.ventalink.app`) si quieres compartir sesión entre ar y cl (hoy la app usa sesión de Supabase en el mismo origen).
- [ ] **Analytics / Ads**: si usas Google Analytics, AdSense u otro por dominio, configura propiedades o IDs por ar.ventalink.app y cl.ventalink.app si lo necesitas.
- [ ] **Supabase Auth**: un solo proyecto Supabase sirve a ambos dominios; los usuarios son los mismos. Si quisieras separar usuarios por país, sería un cambio de diseño (por ejemplo, campo `country` en perfil y lógica en la app).

---

Resumen: lo crítico es **Supabase URL Configuration** y que **Vercel** tenga los dominios y las env necesarias. El resto es opcional o de branding/documentación.
