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
import GoInternationalLanding from "./pages/go-international-landing";
import BusinessRegistration from './pages/business-registration';
import LandingPage from './pages/landing-page';
import BusinessConfiguration from './pages/business-configuration';
import ProductManagement from './pages/product-management';
import Dashboard from './pages/dashboard';
import ProductEditor from './pages/product-editor';
import DesignPage from './pages/design';
import HelpPage from './pages/help';
import PublicCatalog from './pages/public-catalog';
import OrderConfirmation from './pages/order-confirmation';
import Orders from './pages/orders';
import OrdersHistory from './pages/orders-history';
import Login from './pages/login';
import AuthCallback from './pages/auth-callback';
import ResetPassword from './pages/reset-password';
import VerifyEmailPage from './pages/verify-email';
import AdminDashboard from './pages/admin';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminBusinessDetailPage from './pages/admin/AdminBusinessDetailPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminUserNewPage from './pages/admin/AdminUserNewPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminEmailsPage from './pages/admin/AdminEmailsPage';
import PlansPage from './pages/plans';
import BillingSuccessPage from './pages/billing/BillingSuccessPage';
import BillingCancelPage from './pages/billing/BillingCancelPage';
import PaypalSuccessPage from './pages/billing/PaypalSuccessPage';
import PublicPricingPage from './pages/legal/PublicPricingPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import RefundsPage from './pages/legal/RefundsPage';

/**
 * Raíz: en go.ventalink.app es la landing internacional SEO; en cl/ar redirige al panel.
 */
function GoRootEntry() {
  const isGo =
    typeof window !== "undefined" &&
    /(^|\.)go\.ventalink\.app$/.test((window.location?.hostname || "").toLowerCase());
  if (isGo) {
    return <GoInternationalLanding />;
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
            <Route path="/" element={<GoRootEntry />} />
            <Route path="/elegir-pais" element={<CountrySelectPage />} />
            <Route path="/business-registration" element={<BusinessRegistration />} />
            <Route path="/landing-page" element={<LandingPage />} />
            <Route path="/business-configuration" element={<RequireAuth><BusinessConfiguration /></RequireAuth>} />
            <Route path="/product-management" element={<RequireAuth><ProductManagement /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/product-editor" element={<RequireAuth><ProductEditor /></RequireAuth>} />
            <Route path="/orders/historial" element={<RequireAuth><OrdersHistory /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
            <Route path="/design" element={<RequireAuth><DesignPage /></RequireAuth>} />
            <Route path="/ayuda" element={<RequireAuth><HelpPage /></RequireAuth>} />
            <Route path="/login" element={<Login />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* Misma pantalla: enlaces antiguos /reset-password siguen funcionando (conserva hash al cargar esta ruta) */}
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/planes" element={<RequireAuth><PlansPage /></RequireAuth>} />
            <Route path="/billing/success" element={<BillingSuccessPage />} />
            <Route path="/billing/paypal/success" element={<PaypalSuccessPage />} />
            <Route path="/billing/cancel" element={<BillingCancelPage />} />
            <Route path="/plans" element={<PublicPricingPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/catalog/:slug" element={<PublicCatalog />} />
            <Route path="/catalog/:slug/checkout" element={<OrderConfirmation />} />
            <Route path="/catalogo/:slug" element={<PublicCatalog />} />
            <Route path="/catalogo/:slug/checkout" element={<OrderConfirmation />} />
            <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
            <Route path="/admin/payments" element={<RequireAdmin><AdminPaymentsPage /></RequireAdmin>} />
            <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
            <Route path="/admin/users/new" element={<RequireAdmin><AdminUserNewPage /></RequireAdmin>} />
            <Route path="/admin/users/:userId" element={<RequireAdmin><AdminUserDetailPage /></RequireAdmin>} />
            <Route path="/admin/businesses/:businessId" element={<RequireAdmin><AdminBusinessDetailPage /></RequireAdmin>} />
            <Route path="/admin/audit-log" element={<RequireAdmin><AdminAuditLogPage /></RequireAdmin>} />
            <Route path="/admin/emails" element={<RequireAdmin><AdminEmailsPage /></RequireAdmin>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </RouterRoutes>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
