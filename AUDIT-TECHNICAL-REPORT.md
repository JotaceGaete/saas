# Informe técnico de auditoría — Catálogo WhatsApp (Rocket.new)

## 1. Arquitectura del proyecto

### Framework y stack
- **Framework:** React 18 con Vite 5.
- **Lenguaje:** JavaScript (JSX); no hay TypeScript.
- **Estilos:** Tailwind CSS (con plugins: forms, aspect-ratio, container-queries, line-clamp, typography, animate, fluid-type, elevation).
- **Build:** Vite (`vite build --sourcemap`). Punto de entrada: `src/index.jsx` → `App.jsx` → `Routes.jsx`.
- **Dependencias críticas (rocketCritical):** react, react-dom, @reduxjs/toolkit, redux, react-router-dom, @dhiwise/component-tagger, vite, @vitejs/plugin-react, vite-tsconfig-paths, tailwindcss, autoprefixer, postcss. No deben eliminarse ni modificarse.

### Estructura de carpetas principales
```
c:\saas1\
├── src/
│   ├── App.jsx                 # AuthProvider + ToastProvider + Routes
│   ├── Routes.jsx              # Definición de rutas
│   ├── index.jsx               # Entry point
│   ├── contexts/
│   │   ├── AuthContext.jsx     # Usuario, negocio, signIn/signUp/signOut
│   │   └── CartContext.jsx     # Carrito para catálogo público
│   ├── lib/
│   │   └── supabase.js         # Cliente Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   ├── services/
│   │   └── waBusinessService.js  # Único servicio: negocios, productos, pedidos, storage
│   ├── pages/                  # Una carpeta por ruta/feature
│   │   ├── business-registration/  # Registro y login (formulario único)
│   │   ├── business-configuration/ # Configuración del negocio (ruta por defecto "/")
│   │   ├── dashboard/          # Métricas, pedidos, enlace catálogo
│   │   ├── product-management/ # Listado y filtros de productos
│   │   ├── product-editor/     # Crear/editar producto
│   │   ├── orders/             # Listado de pedidos
│   │   ├── public-catalog/     # Catálogo público por slug
│   │   ├── order-confirmation/ # Checkout (confirmar y enviar por WhatsApp)
│   │   ├── login/              # Página de login (redirección si ya autenticado)
│   │   ├── landing-page/       # Landing pública
│   │   └── NotFound.jsx
│   ├── components/
│   │   ├── ui/                 # Button, Input, Toast, Sidebar, etc.
│   │   ├── AppIcon.jsx, AppImage.jsx, ErrorBoundary, ScrollToTop
│   └── styles/                 # tailwind.css, index.css
├── supabase/
│   └── migrations/             # SQL: esquema wa_*, RLS, triggers, storage
├── .env                         # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, etc.
├── package.json
└── index.html
```

### Routing
- **Router:** `react-router-dom` (BrowserRouter). Rutas definidas en `src/Routes.jsx`.
- **Rutas:**
  - `/` → BusinessConfiguration
  - `/business-registration` → BusinessRegistration (registro/login)
  - `/landing-page` → LandingPage
  - `/business-configuration` → BusinessConfiguration
  - `/product-management` → ProductManagement
  - `/dashboard` → Dashboard
  - `/product-editor` → ProductEditor
  - `/orders` → Orders
  - `/login` → Login
  - `/catalog/:slug` y `/catalogo/:slug` → PublicCatalog
  - `/catalog/:slug/checkout` y `/catalogo/:slug/checkout` → OrderConfirmation
  - `*` → NotFound
- No hay rutas protegidas: Dashboard y BusinessConfiguration no redirigen a login si no hay sesión.

### Jerarquía de componentes
- **App:** AuthProvider → ToastProvider → Routes.
- **AuthContext:** expone `user`, `business`, `loading`, `businessLoading`, `signIn`, `signUp`, `signOut`, `refreshBusiness`, `isAuthenticated`. Carga el negocio al tener sesión (`getMyBusiness`).
- **PublicCatalog:** envuelve el contenido en `CartProvider`; el catálogo usa `getBusinessBySlug` + `getPublicProducts` (sin auth).
- **Dashboard / BusinessConfiguration / ProductManagement / Orders / ProductEditor:** usan `useAuth()` y opcionalmente `waBusinessService`; no hay wrapper de “ruta protegida” que redirija a login.

### Gestión de estado
- **Auth:** React Context (`AuthContext`) — usuario y negocio en memoria; sin Redux para auth.
- **Carrito (catálogo público):** React Context (`CartContext`) — ítems, total, add/update/remove/clear.
- **Redux:** presente en `package.json` pero no se ha visto uso en los archivos revisados; la app se apoya en Context y estado local.

---

## 2. Dependencias de backend

### Supabase
- **Cliente:** `src/lib/supabase.js`. `createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: true, persistSession: true } })`.
- **Variables de entorno:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Si faltan, el módulo lanza en carga: *"Missing Supabase environment variables..."*.
- **Uso:** Todo el acceso a datos y auth pasa por este cliente (auth, tablas, storage). No hay otro backend ni API propia.

### Autenticación
- **Supabase Auth:** `signInWithPassword`, `signUp`, `signOut`, `getSession`, `onAuthStateChange`, `getUser`.
- **Flujo:** AuthContext suscribe `onAuthStateChange`; al haber sesión llama a `getMyBusiness()` y guarda `business` en contexto. Login y registro están en `business-registration` (modo register/login) y en `login` (solo login).

### Tablas utilizadas (prefijo `wa_`)
- **wa_businesses:** negocio por usuario (user_id, name, slug, whatsapp, currency, logo_url, design_settings, etc.).
- **wa_products:** productos por business_id (name, price, image_url, is_active, category, has_options, etc.).
- **wa_orders:** pedidos por business_id (customer_name, customer_phone, total_amount, status, notes).
- **wa_order_items:** líneas del pedido (order_id, product_id, product_name, product_price, quantity, subtotal).

Todas las tablas tienen prefijo `wa_` y están definidas en `supabase/migrations/20260309142017_wa_catalog_app.sql` y migraciones posteriores.

### Llamadas a “API” (servicio)
- **waBusinessService.js** concentra todas las llamadas a Supabase:
  - Negocios: `getMyBusiness`, `getBusinessBySlug`, `createBusiness`, `createBusinessForUser`, `updateBusiness`, `uploadBusinessLogo`, `uploadBusinessCover`.
  - Productos: `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `uploadProductImage`, `getPublicProducts`.
  - Pedidos: `getOrders`, `updateOrder`, `createOrder`; analíticas: `getOrdersByDay`, `getTopProducts`, `getMonthlyRevenue`.
- Las consultas usan el patrón `supabase?.from('wa_*')?.select(...)?.eq(...)` (optional chaining en cada paso). Si `supabase` no estuviera definido, el módulo ya habría fallado al importar; en runtime el encadenamiento es correcto.

### Storage
- Buckets: `wa-product-images`, `wa-business-logos`, `wa-business-covers` (públicos de lectura; subida/borrado para `authenticated`). Definidos en migraciones.

---

## 3. Problemas detectados

### Formularios y flujos
1. **Registro → Dashboard sin sesión:** Tras `signUp` con confirmación de email activada, Supabase devuelve `data.session === null`. El código redirige igual a `/dashboard`. El usuario queda sin sesión en el cliente; `onAuthStateChange` recibe `session = null`, por lo que `user` y `business` quedan en `null`. El usuario ve el dashboard “vacío” (sin negocio) y no se le redirige a login ni a una pantalla de “confirma tu correo”. El comentario en `business-registration/index.jsx` dice que “AuthenticationWrapper will handle redirect if not authed”, pero **AuthenticationWrapper no envuelve ninguna ruta** en `Routes.jsx`; por tanto esa lógica no existe.
2. **OrderConfirmation (checkout):** Si `createOrder` falla (por ejemplo por RLS o red), el `catch` solo hace `console.error(e)` y no muestra mensaje al usuario ni deshabilita el flujo. El usuario puede creer que el pedido se envió cuando no se guardó en BD.
3. **OrderConfirmation:** `formatPrice` usa `'en-US'` y `'USD'` fijos; el resto del catálogo usa `business?.currency` y locale coherente (ej. `es-CO`). Inconsistencia de moneda/idioma en la página de confirmación.

### Llamadas Supabase y errores
- **createOrder (guest):** RLS permite `INSERT TO public` en `wa_orders` y `wa_order_items`; el cliente anónimo puede insertar. Si en el proyecto se restringe después la política o hay error de red, el fallo no se comunica al usuario.
- **Errores de negocio en signup:** En `AuthContext.signUp`, si `createBusinessForUser` falla, solo se hace `console.error` y no se bloquea el registro; el usuario puede quedar sin negocio en contexto hasta que el trigger o un reintento lo cree. No se muestra mensaje específico al usuario.

### Variables de entorno
- **Requeridas para que la app funcione:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. En `.env` están definidas (URL y anon key de Supabase).
- Otras variables en `.env` (OpenAI, Gemini, Analytics, Stripe, etc.) no se han visto usadas en el código revisado; su ausencia no debería afectar el flujo principal.

### Mensajes genéricos que ocultan errores
- **business-registration:** En `catch` se muestra *"Error al crear la cuenta. Por favor intenta de nuevo."* sin detalle del error de Supabase (p. ej. usuario ya existente o error de red).
- **Login (login/index.jsx):** Sí se mapean algunos mensajes (credenciales inválidas, email no confirmado); es el flujo más claro.
- **OrderConfirmation:** No hay mensaje de error en UI ante fallo de `createOrder`.

---

## 4. Flujo de registro (signup) — mapa detallado

1. **Usuario envía el formulario** en `BusinessRegistration` → `RegistrationForm` (nombre negocio, email, contraseña, confirmación, WhatsApp). Validación cliente: campos obligatorios, email válido, contraseña ≥ 6, contraseñas coinciden.
2. **handleRegister** llama a `signUp(formData.email, formData.password, businessData)` con `businessData`: name, whatsapp, description, currency (por defecto CLP).
3. **AuthContext.signUp:**
   - Llama a `supabase.auth.signUp({ email, password, options: { data: { full_name, name, whatsapp } } })`.
   - Si `signUp` devuelve `error`, retorna `{ data: null, error }` y el formulario muestra `authError`.
   - Si no hay error:
     - `userId = data.user.id`, `hasSession = !!data.session`.
     - Si **hay sesión** (confirmación de email desactivada):
       - Llama a `getMyBusiness()`. Si no hay negocio, llama a `createBusinessForUser(userId, businessData)` y actualiza `setBusiness(biz)` o `setBusiness(existingBiz)`.
       - Cualquier error de creación de negocio solo se registra en consola; no se devuelve error al usuario.
     - Si **no hay sesión** (confirmación de email activada): no se llama a `getMyBusiness` ni a `createBusinessForUser`; el trigger en BD (si existe) es el único que puede crear el negocio al insertar en `auth.users`.
   - Retorna `{ data, error: null }`.
4. **BusinessRegistration** tras `signUp` sin error:
   - Si `data.session` existe → `navigate('/dashboard')`.
   - Si no existe sesión → también `navigate('/dashboard')` (comentario: “AuthenticationWrapper will handle redirect” — pero no aplica).
5. **En Supabase (backend):** El trigger `wa_on_auth_user_created` (migración `20260309240000_fix_wa_business_signup_trigger.sql`) se ejecuta `AFTER INSERT ON auth.users`. La función `wa_handle_new_user_business()` (SECURITY DEFINER) crea una fila en `wa_businesses` con name/full_name/whatsapp del `raw_user_meta_data` y un slug único. Así el negocio se crea en el servidor en el momento del signup, aunque el cliente no tenga sesión aún.
6. **Resumen:** La creación del negocio en BD está cubierta por el trigger. El “bug” de signup no es tanto que no se cree el negocio, sino que **el usuario es enviado al dashboard sin sesión**, ve la app como no autenticado (sin negocio en contexto) y **no hay redirección a login ni pantalla de “confirma tu email”**. Además, **AuthenticationWrapper no se usa en rutas**, por lo que la protección comentada en el código no existe.

---

## 5. Verificación de integración Supabase

### Variables de entorno
- **Correctas en .env:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están definidas (valor real de proyecto Supabase). El cliente se inicializa solo si ambas existen; si falta alguna, se lanza error al cargar el módulo.

### Inicialización del cliente
- **Archivo:** `src/lib/supabase.js`. Un solo `createClient` exportado como `supabase`. Sin múltiples clientes ni condicionales que dejen `supabase` en undefined en condiciones normales.

### Nombres de tablas
- Coinciden con el estándar del proyecto: **wa_businesses**, **wa_products**, **wa_orders**, **wa_order_items**. No se usan tablas sin prefijo `wa_`.

### Compatibilidad con RLS
- **wa_businesses:** SELECT público; ALL (SELECT/INSERT/UPDATE/DELETE) para `authenticated` con `user_id = auth.uid()`. Trigger de signup inserta con SECURITY DEFINER.
- **wa_products:** SELECT público (solo filas con `is_active = true`); ALL para autenticados dueños del negocio.
- **wa_orders:** SELECT y UPDATE para dueños del negocio; INSERT permitido a `public` (anon) para checkout público.
- **wa_order_items:** SELECT para dueños; INSERT a `public` para crear líneas desde checkout.
- **Storage:** Lectura pública de los buckets; INSERT/DELETE para `authenticated` según políticas por bucket.

La lógica de la app (getMyBusiness con sesión, getBusinessBySlug/getPublicProducts sin sesión, createOrder sin sesión) es compatible con estas políticas.

---

## 6. Resumen ejecutivo

### Cómo funciona la app
- **Público:** Landing y catálogo por slug (`/catalogo/:slug` o `/catalog/:slug`). El catálogo carga negocio por slug y productos activos, permite añadir al carrito y enviar pedido por WhatsApp (mensaje prellenado). Opcionalmente puede guardar el pedido en BD en la ruta de checkout (`/catalogo/:slug/checkout`).
- **Autenticados:** Tras login o registro (con sesión), el usuario tiene un negocio en contexto (creado por trigger o por `createBusinessForUser` si hace falta). Dashboard muestra métricas, pedidos y enlace del catálogo; configuración permite editar negocio, productos y diseño; pedidos y productos tienen sus propias vistas.

### Creación de tiendas (negocios)
- **Automática:** Al registrarse, el trigger `wa_on_auth_user_created` inserta una fila en `wa_businesses` con nombre/WhatsApp del metadata y slug único (SECURITY DEFINER, no depende de RLS del cliente).
- **Fallback en cliente:** Si hay sesión justo después de signUp y `getMyBusiness()` no devuelve negocio, se llama a `createBusinessForUser`; los errores no se propagan al usuario.

### Generación del catálogo
- **Datos:** `getBusinessBySlug(slug)` (wa_businesses por slug, is_active) y `getPublicProducts(businessId)` (wa_products activos, ordenados por sort_order). Sin autenticación.
- **URL:** El enlace del catálogo es `{origin}/catalogo/{business.slug}` (también soportado `/catalog/:slug`). Slug se genera al crear el negocio (nombre normalizado, único).

### Manejo de pedidos
- **En BD:** `createOrder(businessId, orderData, items)` inserta en `wa_orders` y `wa_order_items`. Usado desde OrderConfirmation (checkout) y accesible por anónimos (RLS). El dashboard obtiene pedidos con `getOrders(businessId)` y usa Realtime sobre `wa_orders` para notificaciones.
- **En WhatsApp:** El flujo construye un mensaje con ítems y total y abre `https://wa.me/{phone}?text=...`. El guardado en BD y el envío por WhatsApp son independientes; si falla el guardado, el usuario no recibe feedback en la UI.

### Dónde se sitúa el bug de signup
- **Comportamiento:** Tras registrarse con confirmación de email, el usuario es redirigido a `/dashboard` sin sesión. Ve el dashboard con `user` y `business` en null (y posible aviso “Configura tu negocio”) y puede navegar por rutas “privadas” sin estar logueado.
- **Causas identificadas:**
  1. No hay rutas protegidas: ninguna ruta comprueba sesión y redirige a `/login` o a “confirmá tu email”.
  2. El comentario que menciona que AuthenticationWrapper manejará la redirección no se cumple: AuthenticationWrapper no envuelve rutas en `Routes.jsx`.
  3. Tras signUp sin sesión, se hace igual `navigate('/dashboard')` en lugar de redirigir a login o a una página de “revisa tu correo”.
- **Recomendación (solo diagnóstico):** Para corregir el flujo habría que (1) usar un wrapper de rutas protegidas que redirija a login (o a “confirmá tu email”) cuando no haya sesión, y (2) tras registro con confirmación, redirigir a una pantalla de “revisa tu correo” o a login en lugar de al dashboard.

---

*Auditoría limitada a análisis y documentación; no se han implementado cambios en código ni en estructura del proyecto.*
