import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes as RouterRoutes, Route, Navigate } from "react-router-dom";
import ScrollToTop from "components/ScrollToTop";
import ErrorBoundary from "components/ErrorBoundary";
import AnimatedLayout from "components/AnimatedLayout";
import NotFound from "pages/NotFound";
import RequireAdmin from "components/RequireAdmin";
import RequireAuth from "components/RequireAuth";
import RequireCrm from "components/RequireCrm";
import FeatureGate from "components/ui/FeatureGate";
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
import AffiliatesPage from './pages/affiliates';
import PublicCatalog, { CatalogForSlug } from './pages/public-catalog';
import PublicOffers from './pages/public-offers';
import PublicProductPage from './pages/public-product';
import OrderConfirmation from './pages/order-confirmation';
import Orders from './pages/orders';
import OrdersHistory from './pages/orders-history';
import CustomerPage from './pages/customers';
import SuppliersPage from './pages/suppliers';
import SupplierDetail from './pages/suppliers/SupplierDetail';
import CrmDashboard from './pages/crm/CrmDashboard';
import CrmCustomers from './pages/crm/CrmCustomers';
import CrmQuotes from './pages/crm/CrmQuotes';
import CrmQuoteEditor from './pages/crm/CrmQuoteEditor';
import CrmInvoices from './pages/crm/CrmInvoices';
import CrmInvoiceEditor from './pages/crm/CrmInvoiceEditor';
import CrmStock from './pages/crm/CrmStock';
import CrmTerminal from './pages/crm/CrmTerminal';
import CrmCash from './pages/crm/CrmCash';
import CrmCostCenter from './pages/crm/CrmCostCenter';
import CrmPurchases from './pages/crm/CrmPurchases';
import CrmCostos from './pages/crm/CrmCostos';
import CrmBarcodes from './pages/crm/CrmBarcodes';
import Login from './pages/login';
import AuthCallback from './pages/auth-callback';
import ResetPassword from './pages/reset-password';
import VerifyEmailPage from './pages/verify-email';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminAffiliatePayoutsPage from './pages/admin/AdminAffiliatePayoutsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminBusinessesPage from './pages/admin/AdminBusinessesPage';
import AdminBusinessDetailPage from './pages/admin/AdminBusinessDetailPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminUserNewPage from './pages/admin/AdminUserNewPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminEmailsPage from './pages/admin/AdminEmailsPage';
import AdminConfigRubrosPage from './pages/admin/AdminConfigRubrosPage';
import AdminPlanFeaturesPage from './pages/admin/AdminPlanFeaturesPage';
import AdminCatalogTemplatesPage from './pages/admin/AdminCatalogTemplatesPage';
import OnboardingPage from './pages/onboarding';
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
import { isCustomDomain } from './lib/platformHosts';

/**
 * Raíz `/` en go.ventalink.app: sesión → dashboard; sin sesión → login (nunca apex/www).
 * En dominios personalizados: resuelve dominio → slug → navega a /catalogo/:slug.
 */
function GoRootEntry() {
  const hostname = typeof window !== 'undefined' ? (window.location?.hostname || '') : '';
  const customDomain = isCustomDomain(hostname);
  const { user, loading } = useAuth();
  const [customSlug, setCustomSlug] = useState(null);
  const [customResolved, setCustomResolved] = useState(!customDomain);

  useEffect(() => {
    if (!customDomain) return;
    fetch(`/api/seo?mode=domain-lookup&domain=${encodeURIComponent(hostname)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ slug }) => { setCustomSlug(slug || null); setCustomResolved(true); })
      .catch(() => setCustomResolved(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (customDomain) {
    if (!customResolved) return <PremiumLoader fullScreen />;
    // Renderizar catálogo directamente (URL permanece en el dominio personalizado)
    if (customSlug) return <CatalogForSlug slug={customSlug} />;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" fill="none" stroke="#9ca3af" strokeWidth="1.8" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#9ca3af"/>
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-700 mb-1">Tienda no encontrada</h1>
        <p className="text-sm text-gray-400">Este dominio no tiene un catálogo asociado aún.</p>
      </div>
    );
  }

  if (loading) return <PremiumLoader fullScreen />;

  const isGo = /(^|\.)go\.ventalink\.app$/.test(hostname.toLowerCase());
  if (!isGo) return <Navigate to={user ? '/dashboard' : '/login'} replace />;
  if (!user) return <Navigate to="/login" replace />;
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
            <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
            {/* CRM — requiere plan Pro o superior (RequireCrm hace el bloqueo duro) */}
            <Route path="/crm"                    element={<RequireCrm><CrmDashboard /></RequireCrm>} />
            <Route path="/crm/clientes"           element={<RequireCrm><CrmCustomers /></RequireCrm>} />
            <Route path="/crm/presupuestos"       element={<RequireCrm><CrmQuotes /></RequireCrm>} />
            <Route path="/crm/presupuestos/nuevo" element={<RequireCrm><CrmQuoteEditor /></RequireCrm>} />
            <Route path="/crm/presupuestos/:id"   element={<RequireCrm><CrmQuoteEditor /></RequireCrm>} />
            <Route path="/crm/stock"              element={<RequireCrm><CrmStock /></RequireCrm>} />
            <Route path="/crm/terminal"           element={<RequireCrm><CrmTerminal /></RequireCrm>} />
            <Route path="/crm/caja"               element={<RequireCrm><CrmCash /></RequireCrm>} />
            <Route path="/crm/cost-center"        element={<RequireCrm><CrmCostCenter /></RequireCrm>} />
            <Route path="/crm/facturas"           element={<RequireCrm><FeatureGate feature="invoices"><CrmInvoices /></FeatureGate></RequireCrm>} />
            <Route path="/crm/facturas/nueva"     element={<RequireCrm><FeatureGate feature="invoices"><CrmInvoiceEditor /></FeatureGate></RequireCrm>} />
            <Route path="/crm/facturas/:id"       element={<RequireCrm><FeatureGate feature="invoices"><CrmInvoiceEditor /></FeatureGate></RequireCrm>} />
            <Route path="/crm/compras"            element={<RequireCrm><FeatureGate feature="purchaseInvoices"><CrmPurchases /></FeatureGate></RequireCrm>} />
            <Route path="/crm/costos"             element={<RequireCrm><FeatureGate feature="fixedCosts"><CrmCostos /></FeatureGate></RequireCrm>} />
            <Route path="/crm/barcodes"           element={<RequireCrm><FeatureGate feature="barcodePrinting"><CrmBarcodes /></FeatureGate></RequireCrm>} />
            <Route path="/business-configuration" element={<RequireAuth><BusinessConfiguration /></RequireAuth>} />
            <Route path="/product-management" element={<RequireAuth><ProductManagement /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/product-editor" element={<RequireAuth><ProductEditor /></RequireAuth>} />
            <Route path="/orders/historial" element={<RequireAuth><OrdersHistory /></RequireAuth>} />
            <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
            <Route path="/customers/:customerId" element={<RequireAuth><CustomerPage /></RequireAuth>} />
            <Route path="/proveedores" element={<RequireAuth><SuppliersPage /></RequireAuth>} />
            <Route path="/proveedores/:supplierId" element={<RequireAuth><SupplierDetail /></RequireAuth>} />
            <Route path="/design" element={<RequireAuth><DesignPage /></RequireAuth>} />
            <Route path="/ayuda" element={<RequireAuth><HelpPage /></RequireAuth>} />
            {/* Rollout temporal: solo admins mientras el programa está en pruebas.
                Reutiliza RequireAdmin (mismo mecanismo que /admin/*) -- cuando se
                abra al público, este cambio es solo volver a RequireAuth. */}
            <Route path="/afiliados" element={<RequireAdmin><AffiliatesPage /></RequireAdmin>} />
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
            <Route path="/admin/affiliate-payouts" element={<RequireAdmin><AdminAffiliatePayoutsPage /></RequireAdmin>} />
            <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
            <Route path="/admin/users/new" element={<RequireAdmin><AdminUserNewPage /></RequireAdmin>} />
            <Route path="/admin/users/:userId" element={<RequireAdmin><AdminUserDetailPage /></RequireAdmin>} />
            <Route path="/admin/config/rubros" element={<RequireAdmin><AdminConfigRubrosPage /></RequireAdmin>} />
            <Route path="/admin/config/categories" element={<RequireAdmin><AdminConfigRubrosPage /></RequireAdmin>} />
            <Route path="/admin/audit-log" element={<RequireAdmin><AdminAuditLogPage /></RequireAdmin>} />
            <Route path="/admin/emails" element={<RequireAdmin><AdminEmailsPage /></RequireAdmin>} />
            <Route path="/admin/plan-features" element={<RequireAdmin><AdminPlanFeaturesPage /></RequireAdmin>} />
            <Route path="/admin/catalog-templates" element={<RequireAdmin><AdminCatalogTemplatesPage /></RequireAdmin>} />
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
