import React from "react";
import { BrowserRouter, Routes as RouterRoutes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "components/ScrollToTop";
import ErrorBoundary from "components/ErrorBoundary";
import AnimatedLayout from "components/AnimatedLayout";
import NotFound from "pages/NotFound";
import RequireAdmin from "components/RequireAdmin";
import RequireAuth from "components/RequireAuth";
import RequireOnboardingComplete from "components/RequireOnboardingComplete";
import SessionExpiredHandler from "components/SessionExpiredHandler";
import CountrySelectPage from "./pages/country-select";
import BusinessRegistration from './pages/business-registration';
import OnboardingPage from './pages/onboarding';
import LandingPage from './pages/landing-page';
import ProductManagement from './pages/product-management';
import Dashboard from './pages/dashboard';
import ProductEditor from './pages/product-editor';
import DesignPage from './pages/design';
import HelpPage from './pages/help';
import PublicCatalog from './pages/public-catalog';
import PublicOffers from './pages/public-offers';
import OrderConfirmation from './pages/order-confirmation';
import Orders from './pages/orders';
import OrdersHistory from './pages/orders-history';
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

/**
 * Raíz `/` en go.ventalink.app: sesión → dashboard; sin sesión → login (nunca apex/www).
 * En otros hosts, navegación relativa a /login o /dashboard para que Vercel redirija al host app.
 */
function GoRootEntry() {
  const isGo =
    typeof window !== "undefined" &&
    /(^|\.)go\.ventalink\.app$/.test((window.location?.hostname || "").toLowerCase());
  const { user, loading, resolvePostAuthRoute } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" style={{ fontFamily: 'var(--font-body)' }}>
        <svg className="animate-spin mb-3" width={36} height={36} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-slate-500">Cargando…</p>
      </div>
    );
  }

  if (!isGo) {
    return <Navigate to={user ? resolvePostAuthRoute() : "/business-registration"} replace />;
  }

  if (!user) {
    return <Navigate to="/business-registration" replace />;
  }

  return <Navigate to={resolvePostAuthRoute()} replace />;
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
            <Route path="/complete-business-setup" element={<Navigate to="/onboarding" replace />} />
            <Route path="/business-configuration" element={<Navigate to="/onboarding" replace />} />
            <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
            <Route path="/product-management" element={<RequireOnboardingComplete><ProductManagement /></RequireOnboardingComplete>} />
            <Route path="/dashboard" element={<RequireOnboardingComplete><Dashboard /></RequireOnboardingComplete>} />
            <Route path="/product-editor" element={<RequireOnboardingComplete><ProductEditor /></RequireOnboardingComplete>} />
            <Route path="/orders/historial" element={<RequireOnboardingComplete><OrdersHistory /></RequireOnboardingComplete>} />
            <Route path="/orders" element={<RequireOnboardingComplete><Orders /></RequireOnboardingComplete>} />
            <Route path="/design" element={<RequireOnboardingComplete><DesignPage /></RequireOnboardingComplete>} />
            <Route path="/ayuda" element={<RequireOnboardingComplete><HelpPage /></RequireOnboardingComplete>} />
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* Misma pantalla: enlaces antiguos /reset-password siguen funcionando (conserva hash al cargar esta ruta) */}
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/planes" element={<RequireOnboardingComplete><PlansPage /></RequireOnboardingComplete>} />
            <Route path="/plan-y-facturacion" element={<RequireOnboardingComplete><PlansPage /></RequireOnboardingComplete>} />
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
