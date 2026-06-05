import React from "react";
import { BrowserRouter, Routes as RouterRoutes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "components/ScrollToTop";
import ErrorBoundary from "components/ErrorBoundary";
import AnimatedLayout from "components/AnimatedLayout";
import NotFound from "pages/NotFound";
import RequireAdmin from "components/RequireAdmin";
import RequireAuth from "components/RequireAuth";
import SessionExpiredHandler from "components/SessionExpiredHandler";
import CountrySelectPage from "./pages/country-select";
import BusinessRegistration from './pages/business-registration';
import LandingPage from './pages/landing-page';
import BusinessConfiguration from './pages/business-configuration';
import CompleteBusinessSetupPage from './pages/complete-business-setup';
import ProductManagement from './pages/product-management';
import Dashboard from './pages/dashboard';
import ProductEditor from './pages/product-editor';
import DesignPage from './pages/design';
import HelpPage from './pages/help';
import PublicCatalog from './pages/public-catalog';
import PublicOffers from './pages/public-offers';
import PublicProductPage from './pages/public-product';
import OrderConfirmation from './pages/order-confirmation';
import Orders from './pages/orders';
import OrdersHistory from './pages/orders-history';
import CustomerPage from './pages/customers';
import Login from './pages/login';
import AuthCallback from './pages/auth-callback';
import ResetPassword from './pages/reset-password';
import VerifyEmailPage from './pages/verify-email';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminBusinessesPage from './pages/admin/AdminBusinessesPage';
import AdminBusinessDetailPage from './pages/admin/AdminBusinessDetailPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminUserNewPage from './pages/admin/AdminUserNewPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminEmailsPage from './pages/admin/AdminEmailsPage';
import AdminConfigRubrosPage from './pages/admin/AdminConfigRubrosPage';
import PlansPage from './pages/plans';
import BillingSuccessPage from './pages/billing/BillingSuccessPage';
import BillingCancelPage from './pages/billing/BillingCancelPage';
import PaypalSuccessPage from './pages/billing/PaypalSuccessPage';
import PublicPricingPage from './pages/legal/PublicPricingPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import RefundsPage from './pages/legal/RefundsPage';
import DLocalReturnPage from './pages/billing-dlocal-return';
import { useAuth } from './contexts/AuthContext';
import PremiumLoader from './components/ui/PremiumLoader';
import { useCustomDomainSlug } from './hooks/useCustomDomainSlug';

// Layer 1: fires when this module is first imported (before any component renders).
// If you don't see this in the console, the new JS bundle is NOT being served.
console.log(
  '[routes-module] loaded — hostname:',
  typeof window !== 'undefined' ? window.location.hostname : 'ssr',
);

const WALINKA_HOSTS = [
  'ventalink.app',
  'cl.ventalink.app',
  'go.ventalink.app',
  'miralatienda.de',
  'localhost',
  '127.0.0.1',
];

function isWalinkaHost(h) {
  const hostname = (h || '').toLowerCase();
  return WALINKA_HOSTS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/**
 * Raíz `/`:
 * - Dominios personalizados (business_domains) → renderiza el catálogo directamente.
 * - Dominios personalizados sin registro → pantalla de error (NUNCA redirige a /login).
 * - go.ventalink.app con sesión → /dashboard; sin sesión → /login.
 * - Otros hosts Walinka → /login o /dashboard según estado de sesión.
 */
function GoRootEntry() {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '';

  // Layer 2: fires on every render of this component.
  // If you don't see this, GoRootEntry is not being mounted (routing mismatch or crash above it).
  console.log('[GoRootEntry] render — hostname:', hostname, 'pathname:', pathname);

  const { slug: domainSlug, loading: domainLoading } = useCustomDomainSlug();
  const isGo = /(^|\.)go\.ventalink\.app$/.test(hostname);
  const isCustomDomain = !!hostname && !isWalinkaHost(hostname);
  const { user, loading: authLoading } = useAuth();

  // For custom domains, don't block on auth loading — domain lookup is enough.
  if (domainLoading) {
    return <PremiumLoader fullScreen />;
  }

  // Dominio personalizado → NUNCA redirigir a /login ni a ninguna ruta interna.
  if (isCustomDomain) {
    if (domainSlug) {
      console.log('[GoRootEntry] custom domain resolved — slug:', domainSlug);
      return <PublicCatalog slugOverride={domainSlug} />;
    }
    console.warn('[GoRootEntry] custom domain — no slug found, showing fallback. hostname:', hostname);
    // Render a generic 404 rather than redirecting (avoids polluting the URL).
    return <NotFound />;
  }

  if (authLoading) {
    return <PremiumLoader fullScreen />;
  }

  if (!isGo) {
    const dest = user ? '/dashboard' : '/login';
    console.log('[GoRootEntry] walinka host (not go) — navigating to', dest, 'hostname:', hostname);
    return <Navigate to={dest} replace />;
  }

  if (!user) {
    console.log('[GoRootEntry] go.ventalink.app — no user, navigating to /login');
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

const Routes = () => {
  return (
    <BrowserRouter>
      <SessionExpiredHandler />
      <ErrorBoundary>
        <ScrollToTop />
        <RouterRoutes>
          <Route element={<AnimatedLayout />}>
            <Route path="/billing/dlocal/return" element={<DLocalReturnPage />} />
			<Route path="/" element={<GoRootEntry />} />
            <Route path="/elegir-pais" element={<CountrySelectPage />} />
            <Route path="/business-registration" element={<BusinessRegistration />} />
            <Route path="/register" element={<BusinessRegistration />} />
            <Route path="/landing-page" element={<LandingPage />} />
            <Route path="/complete-business-setup" element={<RequireAuth><CompleteBusinessSetupPage /></RequireAuth>} />
            <Route path="/business-configuration" element={<RequireAuth><BusinessConfiguration /></RequireAuth>} />
            <Route path="/product-management" element={<RequireAuth><ProductManagement /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/product-editor" element={<RequireAuth><ProductEditor /></RequireAuth>} />
            <Route path="/orders/historial" element={<RequireAuth><OrdersHistory /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
            <Route path="/customers/:customerId" element={<RequireAuth><CustomerPage /></RequireAuth>} />
            <Route path="/design" element={<RequireAuth><DesignPage /></RequireAuth>} />
            <Route path="/ayuda" element={<RequireAuth><HelpPage /></RequireAuth>} />
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* Misma pantalla: enlaces antiguos /reset-password siguen funcionando (conserva hash al cargar esta ruta) */}
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/planes" element={<RequireAuth><PlansPage /></RequireAuth>} />
            <Route path="/plan-y-facturacion" element={<RequireAuth><PlansPage /></RequireAuth>} />
            <Route path="/billing/success" element={<BillingSuccessPage />} />
            <Route path="/billing/paypal/success" element={<PaypalSuccessPage />} />
            <Route path="/billing/cancel" element={<BillingCancelPage />} />
            <Route path="/billing/paypal/cancel" element={<BillingCancelPage />} />
            <Route path="/plans" element={<PublicPricingPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/catalog/:slug" element={<PublicCatalog />} />
            <Route path="/catalog/:slug/checkout" element={<OrderConfirmation />} />
            <Route path="/catalogo/:slug/ofertas" element={<PublicOffers />} />
            <Route path="/p/:businessSlug/:productSlug" element={<PublicProductPage />} />
            <Route path="/catalogo/:businessSlug/producto/:productSlug" element={<PublicProductPage />} />
            <Route path="/catalogo/:slug" element={<PublicCatalog />} />
            <Route path="/catalogo/:slug/checkout" element={<OrderConfirmation />} />
            <Route path="/admin" element={<Navigate to="/admin/businesses" replace />} />
            <Route path="/admin/businesses" element={<RequireAdmin><AdminBusinessesPage /></RequireAdmin>} />
            <Route path="/admin/businesses/:businessId" element={<RequireAdmin><AdminBusinessDetailPage /></RequireAdmin>} />
            <Route path="/admin/payments" element={<RequireAdmin><AdminPaymentsPage /></RequireAdmin>} />
            <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
            <Route path="/admin/users/new" element={<RequireAdmin><AdminUserNewPage /></RequireAdmin>} />
            <Route path="/admin/users/:userId" element={<RequireAdmin><AdminUserDetailPage /></RequireAdmin>} />
            <Route path="/admin/config/rubros" element={<RequireAdmin><AdminConfigRubrosPage /></RequireAdmin>} />
            <Route path="/admin/config/categories" element={<RequireAdmin><AdminConfigRubrosPage /></RequireAdmin>} />
            <Route path="/admin/audit-log" element={<RequireAdmin><AdminAuditLogPage /></RequireAdmin>} />
            <Route path="/admin/emails" element={<RequireAdmin><AdminEmailsPage /></RequireAdmin>} />
            {/* URL corta del catálogo: /:slug → PublicCatalog.
                React Router v6 prioriza estáticos sobre dinámicos,
                por lo que /dashboard, /login, /planes, etc. nunca caen aquí. */}
            <Route path="/:slug" element={<PublicCatalog />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </RouterRoutes>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
