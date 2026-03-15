import React from "react";
import { BrowserRouter, Routes as RouterRoutes, Route } from "react-router-dom";
import ScrollToTop from "components/ScrollToTop";
import ErrorBoundary from "components/ErrorBoundary";
import AnimatedLayout from "components/AnimatedLayout";
import NotFound from "pages/NotFound";
import RequireAdmin from "components/RequireAdmin";
import BusinessRegistration from './pages/business-registration';
import LandingPage from './pages/landing-page';
import BusinessConfiguration from './pages/business-configuration';
import ProductManagement from './pages/product-management';
import Dashboard from './pages/dashboard';
import ProductEditor from './pages/product-editor';
import PublicCatalog from './pages/public-catalog';
import OrderConfirmation from './pages/order-confirmation';
import Orders from './pages/orders';
import Login from './pages/login';
import AdminDashboard from './pages/admin';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminUserNewPage from './pages/admin/AdminUserNewPage';
import PlansPage from './pages/plans';
import PublicPricingPage from './pages/legal/PublicPricingPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import RefundsPage from './pages/legal/RefundsPage';

const Routes = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ScrollToTop />
        <RouterRoutes>
          <Route element={<AnimatedLayout />}>
            <Route path="/" element={<BusinessConfiguration />} />
            <Route path="/business-registration" element={<BusinessRegistration />} />
            <Route path="/landing-page" element={<LandingPage />} />
            <Route path="/business-configuration" element={<BusinessConfiguration />} />
            <Route path="/product-management" element={<ProductManagement />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/product-editor" element={<ProductEditor />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/login" element={<Login />} />
            <Route path="/planes" element={<PlansPage />} />
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
            <Route path="*" element={<NotFound />} />
          </Route>
        </RouterRoutes>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default Routes;
