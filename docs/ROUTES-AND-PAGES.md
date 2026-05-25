# ROUTES-AND-PAGES.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.
> Fuente: `src/Routes.jsx`

---

## Rutas públicas (sin auth)

| Ruta | Componente | Archivo | Notas |
|------|-----------|---------|-------|
| `/` | `GoRootEntry` | `src/Routes.jsx` | Si es `go.ventalink.app` con sesión → `/dashboard`; sin sesión → `/login`. En otros hosts: redirige a `/dashboard` o `/login`. |
| `/landing-page` | `LandingPage` | `src/pages/landing-page/index.jsx` | Página de marketing |
| `/login` | `Login` | `src/pages/login/index.jsx` | Auth email/password + Google OAuth |
| `/verify-email` | `VerifyEmailPage` | `src/pages/verify-email/index.jsx` | Post-registro, solicita confirmar email |
| `/auth/callback` | `AuthCallback` | `src/pages/auth-callback/index.jsx` | Callback OAuth y magic links Supabase |
| `/auth/reset-password` | `ResetPassword` | `src/pages/reset-password/index.jsx` | Reset password (link email) |
| `/reset-password` | `ResetPassword` | `src/pages/reset-password/index.jsx` | Alias legacy (mantiene hash) |
| `/elegir-pais` | `CountrySelectPage` | `src/pages/country-select/index.jsx` | Selector de país para nuevos usuarios |
| `/business-registration` | `BusinessRegistration` | `src/pages/business-registration/index.jsx` | Registro de negocio paso 1 |
| `/register` | `BusinessRegistration` | `src/pages/business-registration/index.jsx` | Alias de `/business-registration` |
| `/plans` | `PublicPricingPage` | `src/pages/legal/PublicPricingPage.jsx` | Precios públicos (sin auth) |
| `/terms` | `TermsPage` | `src/pages/legal/TermsPage.jsx` | Términos y condiciones |
| `/privacy` | `PrivacyPage` | `src/pages/legal/PrivacyPage.jsx` | Política de privacidad |
| `/refunds` | `RefundsPage` | `src/pages/legal/RefundsPage.jsx` | Política de reembolsos |
| `/catalog/:slug` | `PublicCatalog` | `src/pages/public-catalog/index.jsx` | Catálogo público (inglés) |
| `/catalog/:slug/checkout` | `OrderConfirmation` | `src/pages/order-confirmation/index.jsx` | Checkout catálogo (inglés) |
| `/catalogo/:slug` | `PublicCatalog` | `src/pages/public-catalog/index.jsx` | Catálogo público (español) |
| `/catalogo/:slug/checkout` | `OrderConfirmation` | `src/pages/order-confirmation/index.jsx` | Checkout catálogo (español) |
| `/catalogo/:slug/ofertas` | `PublicOffers` | `src/pages/public-offers/index.jsx` | Página de ofertas del catálogo |
| `/p/:businessSlug/:productSlug` | `PublicProductPage` | `src/pages/public-product/index.jsx` | Página de producto individual (URL corta) |
| `/catalogo/:businessSlug/producto/:productSlug` | `PublicProductPage` | `src/pages/public-product/index.jsx` | Página de producto individual (URL larga) |
| `/:slug` | `PublicCatalog` | `src/pages/public-catalog/index.jsx` | URL corta del catálogo (ej: `/mitienda`). React Router prioriza rutas estáticas, nunca captura `/dashboard`, `/login`, etc. |
| `/billing/dlocal/return` | `DLocalReturnPage` | `src/pages/billing-dlocal-return/index.jsx` | Retorno después de pago dLocal |
| `/billing/success` | `BillingSuccessPage` | `src/pages/billing/BillingSuccessPage.jsx` | Éxito de suscripción (MP) |
| `/billing/paypal/success` | `PaypalSuccessPage` | `src/pages/billing/PaypalSuccessPage.jsx` | Éxito de suscripción PayPal |
| `/billing/cancel` | `BillingCancelPage` | `src/pages/billing/BillingCancelPage.jsx` | Cancelación de suscripción |
| `/billing/paypal/cancel` | `BillingCancelPage` | `src/pages/billing/BillingCancelPage.jsx` | Cancelación PayPal (mismo componente) |

---

## Rutas privadas (RequireAuth)

| Ruta | Componente | Archivo | Notas |
|------|-----------|---------|-------|
| `/complete-business-setup` | `CompleteBusinessSetupPage` | `src/pages/complete-business-setup/index.jsx` | Onboarding post-registro |
| `/business-configuration` | `BusinessConfiguration` | `src/pages/business-configuration/index.jsx` | Config del negocio (WhatsApp, nombre, diseño básico, etc.) |
| `/product-management` | `ProductManagement` | `src/pages/product-management/index.jsx` | Lista/gestión de productos |
| `/product-editor` | `ProductEditor` | `src/pages/product-editor/index.jsx` | Editor de producto individual (crear/editar) |
| `/dashboard` | `Dashboard` | `src/pages/dashboard/index.jsx` | Dashboard principal con stats |
| `/orders` | `Orders` | `src/pages/orders/index.jsx` | Board de pedidos (Kanban-like) |
| `/orders/historial` | `OrdersHistory` | `src/pages/orders-history/index.jsx` | Historial de pedidos |
| `/customers/:customerId` | `CustomerPage` | `src/pages/customers/index.jsx` | Ficha de cliente |
| `/design` | `DesignPage` | `src/pages/design/index.jsx` | Editor de diseño del catálogo |
| `/ayuda` | `HelpPage` | `src/pages/help/index.jsx` | Centro de ayuda |
| `/planes` | `PlansPage` | `src/pages/plans/index.jsx` | Gestión de suscripción (upgrade/downgrade) |
| `/plan-y-facturacion` | `PlansPage` | `src/pages/plans/index.jsx` | Alias de `/planes` |

---

## Rutas admin (RequireAdmin)

| Ruta | Componente | Archivo |
|------|-----------|---------|
| `/admin` | Redirect → `/admin/businesses` | — |
| `/admin/businesses` | `AdminBusinessesPage` | `src/pages/admin/AdminBusinessesPage.jsx` |
| `/admin/businesses/:businessId` | `AdminBusinessDetailPage` | `src/pages/admin/AdminBusinessDetailPage.jsx` |
| `/admin/payments` | `AdminPaymentsPage` | `src/pages/admin/AdminPaymentsPage.jsx` |
| `/admin/users` | `AdminUsersPage` | `src/pages/admin/AdminUsersPage.jsx` |
| `/admin/users/new` | `AdminUserNewPage` | `src/pages/admin/AdminUserNewPage.jsx` |
| `/admin/users/:userId` | `AdminUserDetailPage` | `src/pages/admin/AdminUserDetailPage.jsx` |
| `/admin/config/rubros` | `AdminConfigRubrosPage` | `src/pages/admin/AdminConfigRubrosPage.jsx` |
| `/admin/config/categories` | `AdminConfigRubrosPage` | `src/pages/admin/AdminConfigRubrosPage.jsx` (alias) |
| `/admin/audit-log` | `AdminAuditLogPage` | `src/pages/admin/AdminAuditLogPage.jsx` |
| `/admin/emails` | `AdminEmailsPage` | `src/pages/admin/AdminEmailsPage.jsx` |

---

## Protección de auth

- `RequireAuth` (`src/components/RequireAuth.jsx`): redirige a `/login` si no hay sesión activa.
- `RequireAdmin` (`src/components/RequireAdmin.jsx`): requiere `isAdmin === true` en `AuthContext`.
- `isAdmin` se deriva de: `user.app_metadata.role === 'admin'` o `user.user_metadata.role === 'admin'` (Supabase metadata).

---

## Redirecciones importantes (vercel.json)

| Desde | Hacia | Tipo |
|-------|-------|------|
| `ventalink.app/dashboard` (y otras app routes) | `go.ventalink.app/dashboard` | 302 |
| `www.ventalink.app/(.*)`  | `ventalink.app/$1` | 302 |
| `www.miralatienda.de/(.*)` | `miralatienda.de/$1` | 301 |
| `miralatienda.de/dashboard` (y app routes) | `go.ventalink.app/$1` | 302 |
| `miralatienda.de/catalog/:slug` | `miralatienda.de/catalogo/:slug` | 301 |

---

## Rewrites SEO (vercel.json)

Las rutas de catálogo pasan primero por `/api/seo` para inyectar meta tags (og:title, og:description, og:image):
- `/catalogo/:slug` → `/api/seo?slug=:slug&publicPath=catalogo`
- `/catalog/:slug` → `/api/seo?slug=:slug&publicPath=catalog`
- `/p/:businessSlug/:productSlug` → `/api/seo?publicPath=product&...`
- `/:slug` (catch-all corto) → `/api/seo?slug=:slug&publicPath=short`
- `/sitemap.xml` → `/api/seo?mode=sitemap`

---

## Componentes principales de páginas

| Página | Componentes clave |
|--------|------------------|
| `public-catalog` | `CatalogLayout.jsx`, `CatalogStoreHeader.jsx` |
| `login` | `LoginBrandPanel`, `LoginForm` |
| `dashboard` | 17+ sub-componentes en `src/pages/dashboard/` |
| `orders` | Kanban board, `ordersDoubleFlickerLog.js` (debug log) |
| `plans` | `UnifiedSubscriptionCard` |
| `design` | Editor visual de catálogo |
| `product-editor` | 8+ sub-componentes |
| `business-configuration` | 15+ sub-componentes |

---

## Rutas legacy o alias

- `/register` → alias de `/business-registration`
- `/reset-password` → alias de `/auth/reset-password` (mantiene el hash de Supabase)
- `/plan-y-facturacion` → alias de `/planes`
- `/admin/config/categories` → alias de `/admin/config/rubros`
- `/:slug` → catálogo URL corta (catch-all, React Router lo prioriza después de rutas estáticas)

---

## Catch-all

`/app/pages/NotFound.jsx` cubre todas las rutas no definidas (ruta `*`).
