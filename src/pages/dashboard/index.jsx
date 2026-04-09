import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PanelHeader from "components/ui/PanelHeader";
import DashboardAppShell from "components/ui/DashboardAppShell";
import DashboardLayoutContent from "components/ui/DashboardLayoutContent";
import Icon from "components/AppIcon";
import MetricCard from "./components/MetricCard";
import ActivityFeed from "./components/ActivityFeed";
import CatalogLinkWidget from "./components/CatalogLinkWidget";
import QuickAccessWidget from "./components/QuickAccessWidget";
import GettingStartedSection from "./components/GettingStartedSection";
import NewOrderToast from "./components/NewOrderToast";
import NotificationBell from "./components/NotificationBell";
import { useAuth } from "../../contexts/AuthContext";
import {
  getProducts,
  getOrders,
  getOrdersByDay,
  getTopProducts,
  getMonthlyRevenue,
  getConversionFunnelStats,
  getBusinessVisitStats,
  getPendingOrdersCount,
  getWeeklyOrdersCount,
  getPlanUsage,
  getDashboardAiInsights,
  getEffectivePlanSlug,
  expireDeliveredOrders,
} from "../../services/waBusinessService";
import { supabase } from "../../lib/supabase";
import { getPublicCatalogUrl } from "../../config/appUrl";
import { buildCfImageErrorHandler, cfImageUrl } from "../../utils/cloudflareImage";
import OrdersByDayCard from "./components/OrdersByDayCard";
import TopProductsCard from "./components/TopProductsCard";
import MonthlyRevenueCard from "./components/MonthlyRevenueCard";
import DailyRevenueCard from "./components/DailyRevenueCard";
import ConversionFunnelCard from "./components/ConversionFunnelCard";
import PlanUsageCard from "./components/PlanUsageCard";
import TrialConversionBanner from "./components/TrialConversionBanner";
import AiInsightsCard from "./components/AiInsightsCard";
import AddProductHero from "./components/AddProductHero";
import { getCatalogShareMessage } from "../../utils/branding";
import { getCountryLabels } from "../../config/country";
import { getBusinessLocale } from "../../lib/locale/businessLocale";
import { getTrialDaysLeft } from "../../constants/trial";
import { getCurrentSubscription } from "../../lib/billing/subscriptionService";
import { useToast } from "../../components/ui/Toast";
import { tryCelebrateFirstCatalogShare } from "../../utils/catalogShareCelebration";
import { getSourceLabel } from "../../utils/analytics";

const FIRST_SHARE_TOAST =
  '¡Tu tienda ya está en el mundo! 🌍 Link copiado y listo para enviar.';

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, business, businessLoading, sessionReady, refreshBusiness } = useAuth();
  const locale = getBusinessLocale(business, {
    preferredCountryCode: user?.user_metadata?.country_code ?? null,
  });
  const displayCurrency = String(business?.currency || locale.currencyCode || '—').toUpperCase();
  const displayLocale = locale.locale || 'en-US';
  const dashboardRefreshAttempted = useRef(false);
  const [copyToast, setCopyToast] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [ordersByDay, setOrdersByDay] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(null);
  const [conversionFunnel, setConversionFunnel] = useState(null);
  const [funnelRange, setFunnelRange] = useState('7d');
  const [visitStats, setVisitStats] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [weeklyOrdersCount, setWeeklyOrdersCount] = useState(0);
  const [planUsage, setPlanUsage] = useState(null);
  const [planUsageLoading, setPlanUsageLoading] = useState(true);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Realtime state
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [newOrderToasts, setNewOrderToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [liveOrderCount, setLiveOrderCount] = useState(null);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const channelRef = useRef(null);
  const [dismissedExpiredBanner, setDismissedExpiredBanner] = useState(false);

  const catalogUrl = getPublicCatalogUrl(business?.slug ?? '');

  const planExpiresAt = business?.planExpiresAt ?? null;
  const trialExpiresAt = business?.trialExpiresAt ?? null;
  const planSlugFromSubscription = currentSubscription?.planSlug || null;
  const effectivePlan = getEffectivePlanSlug(planSlugFromSubscription || business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  // Para la UI del dashboard consideramos Starter cuando el slug actual es 'starter'.
  // Solo Pro / Business (incluyendo trials vigentes) ven estadísticas avanzadas.
  const activePlanSlug = planSlugFromSubscription || business?.planSlug || 'starter';
  const isStarterPlan = activePlanSlug === 'starter';
  const isPaidPlan = activePlanSlug === 'pro' || activePlanSlug === 'business';
  const isPlanExpired = isPaidPlan && planExpiresAt && new Date(planExpiresAt) <= new Date();
  const showExpiredBanner = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('showPlanExpiredBanner') === '1';

  // Pro Trial: plan pro/business, trial activo (trialExpiresAt en el futuro), sin plan pagado (sin planExpiresAt)
  const isProTrial =
    (business?.planSlug === 'pro' || business?.planSlug === 'business') &&
    trialExpiresAt &&
    new Date(trialExpiresAt) > new Date() &&
    !planExpiresAt;
  const trialDaysLeft = isProTrial && trialExpiresAt
    ? getTrialDaysLeft(trialExpiresAt)
    : 0;

  // Días hasta vencimiento del plan (pago)
  const daysUntilExpiry = planExpiresAt
    ? Math.ceil((new Date(planExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const planExpiringSoon = isPaidPlan && daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 7;

  useEffect(() => {
    if (user && !business && !businessLoading && !dashboardRefreshAttempted.current) {
      dashboardRefreshAttempted.current = true;
      refreshBusiness();
    }
  }, [user, business, businessLoading, refreshBusiness]);

  const loadDashboardData = useCallback(async () => {
    if (!business?.id) return;
    setDataLoading(true);
    try {
      await expireDeliveredOrders(business?.id);
      const [productsResponse, ordersResponse, pendingRes, weeklyRes] = await Promise.all([
        getProducts(business?.id),
        getOrders(business?.id),
        getPendingOrdersCount(business?.id),
        getWeeklyOrdersCount(business?.id),
      ]);
      setProducts(productsResponse?.data || []);
      if (ordersResponse?.error) {
        console.error('[Dashboard] getOrders error:', ordersResponse?.error?.message || ordersResponse?.error);
        setOrders([]);
      } else {
        setOrders(ordersResponse?.data || []);
      }
      setPendingOrdersCount(pendingRes?.data ?? 0);
      setWeeklyOrdersCount(weeklyRes?.data ?? 0);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setDataLoading(false);
    }
  }, [business?.id]);

  const loadAnalytics = useCallback(async () => {
    if (!business?.id) return;
    setAnalyticsLoading(true);
    try {
      const [dayRes, topRes, revRes, visitRes, funnelRes] = await Promise.all([
        getOrdersByDay(business?.id, 7),
        getTopProducts(business?.id, 5),
        getMonthlyRevenue(business?.id),
        getBusinessVisitStats(business?.id),
        getConversionFunnelStats(business?.id, funnelRange),
      ]);
      setOrdersByDay(dayRes?.data || []);
      setTopProducts(topRes?.data || []);
      if (revRes?.error) console.error('[Dashboard] getMonthlyRevenue:', revRes.error?.message || revRes.error);
      if (funnelRes?.error) console.error('[Dashboard] getConversionFunnelStats:', funnelRes.error?.message || funnelRes.error);
      setMonthlyRevenue(revRes?.data || null);
      setVisitStats(visitRes?.data ?? null);
      setConversionFunnel(funnelRes?.data ?? null);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [business?.id, funnelRange]);

  const loadDailyAiInsight = useCallback(async () => {
    if (!business?.id) return;
    setAiInsightLoading(true);
    try {
      let finalInsight = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const insightRes = await getDashboardAiInsights(business?.id);
        if (insightRes?.data) {
          finalInsight = insightRes.data;
          break;
        }
        if (!insightRes?.pending) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      setAiInsights(finalInsight);
    } catch (err) {
      console.error('[Dashboard] insight load error:', err);
    } finally {
      setAiInsightLoading(false);
    }
  }, [business?.id]);

  const loadPlanUsage = useCallback(async () => {
    if (!business?.id) return;
    setPlanUsageLoading(true);
    try {
      const res = await getPlanUsage(business?.id);
      setPlanUsage(res?.data ?? null);
    } catch (err) {
      console.error('[PlanUsage] error:', err);
    } finally {
      setPlanUsageLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) { setDataLoading(false); return; }
    loadDashboardData();
  }, [business?.id, loadDashboardData]);

  useEffect(() => {
    if (!business?.id) { setAnalyticsLoading(false); return; }
    loadAnalytics();
  }, [business?.id, loadAnalytics]);

  // Guard with sessionReady: on mobile OAuth, business?.id can become truthy before
  // Supabase has finished exchanging the auth code, causing a 401 on the Edge Function.
  useEffect(() => {
    if (!business?.id || !sessionReady) return;
    loadDailyAiInsight();
  }, [business?.id, sessionReady, loadDailyAiInsight]);

  useEffect(() => {
    if (!business?.id) { setPlanUsageLoading(false); return; }
    loadPlanUsage();
  }, [business?.id, loadPlanUsage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!business?.id) {
        if (!cancelled) setCurrentSubscription(null);
        return;
      }
      const data = await getCurrentSubscription(business.id);
      if (!cancelled) setCurrentSubscription(data);
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData();
        loadAnalytics();
        // Reload AI insight on visibility restore — token may have expired while
        // the app was backgrounded (common on mobile after OAuth login).
        loadDailyAiInsight();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [business?.id, loadDashboardData, loadAnalytics, loadDailyAiInsight]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!business?.id) return;

    const channelName = `wa_orders_business_${business?.id}`;
    const onOrderUpdated = async () => {
      await expireDeliveredOrders(business?.id);
      const [{ data: ordersData }, pendingRes] = await Promise.all([
        getOrders(business?.id),
        getPendingOrdersCount(business?.id),
      ]);
      if (ordersData) setOrders(ordersData);
      setPendingOrdersCount(pendingRes?.data ?? 0);
      loadAnalytics();
      loadPlanUsage();
    };

    const channel = supabase?.channel(channelName)?.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wa_orders',
          filter: `business_id=eq.${business?.id}`,
        },
        async (payload) => {
          const newOrder = payload?.new;
          if (!newOrder) return;

          const mappedOrder = {
            id: newOrder?.id,
            customerName: newOrder?.customer_name || newOrder?.customerName || '',
            totalAmount: newOrder?.total_amount ?? newOrder?.totalAmount ?? 0,
            status: newOrder?.order_status || newOrder?.status || 'pedido',
            createdAt: newOrder?.created_at || newOrder?.createdAt || new Date()?.toISOString(),
          };

          await expireDeliveredOrders(business?.id);
          const { data: ordersData } = await getOrders(business?.id);
          if (ordersData) setOrders(ordersData);
          loadAnalytics();
          loadPlanUsage();

          // Actualizar contadores en tiempo real
          setPendingOrdersCount(prev => prev + 1);
          setLiveOrderCount(prev => (prev !== null ? prev + 1 : null));
          setNewOrderIds(prev => new Set([...prev, mappedOrder?.id]));
          setTimeout(() => {
            setNewOrderIds(prev => {
              const next = new Set(prev);
              next?.delete(mappedOrder?.id);
              return next;
            });
          }, 2500);

          const toastId = Date.now();
          setNewOrderToasts(prev => [...prev, { id: toastId, order: mappedOrder }]);
          setNotifications(prev => [
            { id: toastId, customerName: mappedOrder?.customerName, createdAt: mappedOrder?.createdAt, read: false },
            ...prev,
          ]);
        }
      )?.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wa_orders',
          filter: `business_id=eq.${business?.id}`,
        },
        () => {
          void onOrderUpdated();
        }
      )?.subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('reconnecting');
        else if (status === 'CLOSED') setRealtimeStatus('disconnected');
      });

    channelRef.current = channel;
    setRealtimeStatus('reconnecting');

    return () => {
      supabase?.removeChannel(channel);
      channelRef.current = null;
      setRealtimeStatus('disconnected');
    };
  }, [business?.id, loadAnalytics, loadPlanUsage]);

  const handleDismissToast = useCallback((id) => {
    setNewOrderToasts(prev => prev?.filter(t => t?.id !== id));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev?.map(n => ({ ...n, read: true })));
  }, []);

  const handleSendTestEmail = useCallback(async () => {
    setSendingTestEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          to: 'jotacegaete@gmail.com',
          subject: 'Prueba Ventalink',
          html: '<h1>Hola</h1><p>Esto es una prueba</p>',
        }),
      });
      const data = await res.json().catch(() => ({}));
      console.log('[Dashboard] send-email response:', { status: res.status, ok: res.ok, data });
    } catch (err) {
      console.error('[Dashboard] send-email error:', err);
    } finally {
      setSendingTestEmail(false);
    }
  }, []);

  const activeProducts = products?.filter(p => p?.isActive)?.length ?? 0;
  const inactiveProducts = products?.filter(p => !p?.isActive)?.length ?? 0;
  const recentOrders = orders?.filter(o => {
    const diff = (Date.now() - new Date(o?.createdAt)) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  })?.length ?? 0;

  const displayOrderCount = liveOrderCount !== null ? liveOrderCount : recentOrders;

  const visits30d = visitStats?.visits30d ?? 0;
  const visitsToday = visitStats?.visitsToday ?? 0;
  const visits7d = visitStats?.visits7d ?? 0;
  const totalVisits = visitStats?.totalVisits ?? 0;
  const hasAnyVisits = totalVisits > 0;
  const sourceBreakdown = visitStats?.sourceBreakdown ?? null;

  // Alertas del negocio
  const alerts = [];
  if (!dataLoading && pendingOrdersCount > 0) {
    alerts.push({
      id: 'pending-orders',
      icon: 'Clock',
      color: '#D97706',
      bg: 'rgba(245,158,11,0.08)',
      border: 'rgba(245,158,11,0.25)',
      text: `${pendingOrdersCount} pedido${pendingOrdersCount !== 1 ? 's' : ''} esperando tu atención`,
      action: 'Ver pedidos',
      onAction: () => navigate('/orders'),
    });
  }
  // Note: the "no-products" alert is intentionally omitted — AddProductHero (rendered above)
  // serves as the primary CTA when products.length === 0, avoiding competing CTAs.
  if (!dataLoading && products?.length > 0 && activeProducts === 0) {
    alerts.push({
      id: 'no-active',
      icon: 'EyeOff',
      color: '#6B7280',
      bg: 'rgba(107,114,128,0.06)',
      border: 'rgba(107,114,128,0.2)',
      text: 'No tienes productos activos en el catálogo',
      action: 'Activar',
      onAction: () => navigate('/product-management'),
    });
  }
  if (planExpiringSoon && !dismissedExpiredBanner) {
    alerts.push({
      id: 'plan-expiring',
      icon: 'AlertTriangle',
      color: '#DC2626',
      bg: 'rgba(239,68,68,0.06)',
      border: 'rgba(239,68,68,0.2)',
      text: `Tu plan vence en ${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}`,
      action: 'Renovar',
      onAction: () => navigate('/planes'),
    });
  }

  // Avisos progresivos para plan Starter (solo cuando los datos están listos)
  if (!planUsageLoading && planUsage && effectivePlan === 'starter') {
    const usedOrders = planUsage?.ordersThisMonth ?? 0;
    const usedProducts = planUsage?.activeProducts ?? 0;
    const maxOrders = planUsage?.maxOrdersPerMonth ?? 50;
    const maxProducts = planUsage?.maxProducts ?? 20;

    if (usedOrders >= 35 && usedOrders < maxOrders) {
      alerts.push({
        id: 'orders-limit-warning',
        icon: 'TrendingUp',
        color: '#D97706',
        bg: 'rgba(245,158,11,0.08)',
        border: 'rgba(245,158,11,0.25)',
        text: `🚀 Estás vendiendo bien. Te quedan ${maxOrders - usedOrders} pedidos en tu plan gratis.`,
        action: 'Ver planes',
        onAction: () => navigate('/planes'),
      });
    }

    if (usedProducts >= 15 && usedProducts < maxProducts) {
      alerts.push({
        id: 'products-limit-warning',
        icon: 'Package',
        color: '#D97706',
        bg: 'rgba(245,158,11,0.08)',
        border: 'rgba(245,158,11,0.25)',
        text: `⚠️ Te quedan ${maxProducts - usedProducts} espacios para productos en tu plan gratis.`,
        action: 'Ver planes',
        onAction: () => navigate('/planes'),
      });
    }
  }

  const METRICS = [
    {
      title: 'Pedidos pendientes',
      value: dataLoading ? '...' : String(pendingOrdersCount),
      subtitle: pendingOrdersCount > 0 ? 'Requieren tu atención' : 'Todo al día',
      iconName: 'Clock',
      trend: pendingOrdersCount > 0 ? 'up' : null,
      trendValue: pendingOrdersCount > 0 ? `${pendingOrdersCount} sin atender` : '',
      variant: pendingOrdersCount > 0 ? 'warning' : 'default',
      onClick: () => navigate('/orders'),
    },
    {
      title: 'Pedidos recientes',
      value: dataLoading ? '...' : String(displayOrderCount),
      subtitle: 'Últimos 30 días',
      iconName: 'ShoppingCart',
      trend: weeklyOrdersCount > 0 ? 'up' : null,
      trendValue: weeklyOrdersCount > 0 ? `+${weeklyOrdersCount} esta semana` : '',
      onClick: () => navigate('/orders'),
    },
    {
      title: 'Total productos',
      value: dataLoading ? '...' : String(products?.length ?? 0),
      subtitle: dataLoading ? 'Cargando...' : `${activeProducts} activos · ${inactiveProducts} inactivos`,
      iconName: 'Package',
      trend: activeProducts > 0 ? 'up' : null,
      trendValue: activeProducts > 0 ? `${activeProducts} activos` : '',
      onClick: () => navigate('/product-management'),
    },
    {
      title: 'Visitas al catálogo',
      value: analyticsLoading ? '...' : String(visits30d),
      subtitle: hasAnyVisits ? 'Últimos 30 días' : 'Sin visitas aún',
      iconName: 'Eye',
      trend: hasAnyVisits ? 'up' : null,
      trendValue: hasAnyVisits ? `+${visitsToday} hoy${visits7d > 0 ? ` · ${visits7d} en 7d` : ''}` : '',
    },
  ];

  const metricsToShow = isStarterPlan ? METRICS.filter((m) => m.title === 'Total productos') : METRICS;

  const notifyFirstCatalogShare = useCallback(() => {
    if (!business?.id) return;
    if (tryCelebrateFirstCatalogShare(business.id, totalVisits)) {
      toast.success(FIRST_SHARE_TOAST);
    }
  }, [business?.id, totalVisits, toast]);

  const handleCopy = () => {
    if (!catalogUrl) return;
    navigator.clipboard?.writeText(catalogUrl)?.catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2500);
    notifyFirstCatalogShare();
  };

  const handleShare = () => {
    if (!catalogUrl) return;
    const shareMessage = getCatalogShareMessage({
      businessName: business?.name,
      catalogUrl,
      plan: business?.planSlug,
    });
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    notifyFirstCatalogShare();
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cargando tu negocio...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
        {/* Header — respeta safe-area, hamburguesa alineado verticalmente */}
        <PanelHeader
          title={(
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Dashboard</h1>
              {realtimeStatus === 'connected' && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#059669', fontFamily: 'var(--font-caption)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  En vivo
                </span>
              )}
              {realtimeStatus === 'reconnecting' && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(245,158,11,0.08)', color: '#D97706', fontFamily: 'var(--font-caption)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Reconectando...
                </span>
              )}
            </div>
          )}
          subtitle={(
            <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Bienvenido de vuelta, <strong>{business?.name || user?.email}</strong></p>
          )}
        >
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <NotificationBell notifications={notifications} onMarkAllRead={handleMarkAllRead} />
            <button onClick={() => navigate('/business-configuration')} className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 hover:bg-muted" style={{ color: 'var(--color-muted-foreground)' }} aria-label="Configuración">
              <Icon name="Settings" size={17} color="currentColor" />
            </button>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ml-1" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}>
              {business?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
        </PanelHeader>

        <DashboardLayoutContent className="page-enter">

          {/* Banner: negocio sin configurar */}
          {!business && !businessLoading && (
            <div className="flex items-start gap-3 p-4 rounded-xl border slide-up" style={{ backgroundColor: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}>
              <Icon name="AlertCircle" size={18} color="var(--color-primary)" />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Configura tu negocio</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Completa la configuración para empezar a recibir pedidos.</p>
              </div>
              <button onClick={() => navigate('/business-configuration')} className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}>Configurar</button>
            </div>
          )}

          {/* Banner: valor desbloqueado (solo Pro Trial) */}
          {isProTrial && (
            <TrialConversionBanner trialDaysLeft={trialDaysLeft} trialExpiresAt={trialExpiresAt} />
          )}

          {/* Banner: plan expirado */}
          {(showExpiredBanner || isPlanExpired) && !dismissedExpiredBanner && (
            <div className="flex items-start gap-3 p-4 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
              <Icon name="AlertCircle" size={18} color="#dc2626" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Tu plan ha expirado</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Renueva para seguir usando las funciones Pro.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('showPlanExpiredBanner'); navigate('/planes'); }} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>Renovar</button>
                <button onClick={() => { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('showPlanExpiredBanner'); setDismissedExpiredBanner(true); }} className="text-xs font-medium px-2 py-1.5 rounded-lg" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cerrar</button>
              </div>
            </div>
          )}

          {/* Banner: plan por vencer */}
          {isPaidPlan && planExpiresAt && !isPlanExpired && !planExpiringSoon && (
            <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
              <Icon name="Calendar" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-text-secondary)' }}>
                Tu plan vence el: <strong>{new Date(planExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </span>
              <button onClick={() => navigate('/planes')} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>Ver planes</button>
            </div>
          )}

          {/* Hero CTA: visible only when the catalog has no products yet */}
          {!dataLoading && products?.length === 0 && (
            <AddProductHero />
          )}

          {/* Getting Started */}
          <GettingStartedSection
            productCount={products?.length ?? 0}
            business={business}
            catalogUrl={catalogUrl}
            onCopy={handleCopy}
            onCatalogShare={notifyFirstCatalogShare}
          />

          {/* ── Bloque de alertas ── */}
          {alerts.length > 0 && (
            <section>
              <div className="flex flex-col gap-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                    style={{ backgroundColor: alert.bg, borderColor: alert.border }}
                  >
                    <Icon name={alert.icon} size={15} color={alert.color} />
                    <p className="flex-1 text-sm font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {alert.text}
                    </p>
                    <button
                      onClick={alert.onAction}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:opacity-80 active:scale-95"
                      style={{ backgroundColor: alert.color, color: '#fff', fontFamily: 'var(--font-caption)' }}
                    >
                      {alert.action}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isStarterPlan && (
            <section aria-label="Insight IA">
              <AiInsightsCard data={aiInsights} loading={aiInsightLoading} />
            </section>
          )}

          {/* ── Métricas principales (Starter solo ve Total productos) ── */}
          <section aria-label="Métricas del negocio">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {metricsToShow?.map((metric, idx) => (
                <div key={metric.title} className="stagger-item min-w-0" style={metricsToShow.length === 1 ? { maxWidth: '320px' } : undefined}>
                  <MetricCard
                    title={metric.title}
                    value={metric.value}
                    subtitle={metric.subtitle}
                    iconName={metric.iconName}
                    trend={metric.trend}
                    trendValue={metric.trendValue}
                    variant={metric.variant}
                    onClick={metric.onClick}
                    loading={metric.title === 'Total productos' ? dataLoading : idx < 2 ? dataLoading : analyticsLoading}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Analíticas (solo Pro y Business) ── */}
          {!isStarterPlan && (
            <section aria-label="Analíticas">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
                <div className="stagger-item min-w-0"><OrdersByDayCard data={ordersByDay} loading={analyticsLoading} /></div>
                <div className="stagger-item min-w-0"><TopProductsCard data={topProducts} loading={analyticsLoading} /></div>
                <div className="stagger-item min-w-0 grid grid-cols-1 gap-4">
                  <MonthlyRevenueCard
                    data={monthlyRevenue}
                    loading={analyticsLoading}
                    currency={displayCurrency}
                    numberLocale={displayLocale}
                  />
                  <DailyRevenueCard
                    data={monthlyRevenue}
                    loading={analyticsLoading}
                    currency={displayCurrency}
                    numberLocale={displayLocale}
                  />
                </div>
              </div>
              <div className="mt-4">
                <ConversionFunnelCard
                  data={conversionFunnel}
                  loading={analyticsLoading}
                  range={funnelRange}
                  onRangeChange={setFunnelRange}
                  currency={displayCurrency}
                  numberLocale={displayLocale}
                />
              </div>
              {/* Origen de visitas */}
              <div className="mt-4">
                <div className="dashboard-premium-card rounded-2xl border-0 p-5">
                  <h3 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                    Origen de visitas <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· últimos 30d</span>
                  </h3>
                  {analyticsLoading ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Cargando...</p>
                  ) : !sourceBreakdown || Object.keys(sourceBreakdown).length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Sin datos de origen aún.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {(() => {
                        const entries = Object.entries(sourceBreakdown).sort(([, a], [, b]) => b - a);
                        const total = entries.reduce((s, [, n]) => s + n, 0);
                        return entries.map(([src, count]) => {
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                          return (
                            <li key={src} className="flex items-center gap-2">
                              <span className="text-xs w-24 truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                                {getSourceLabel(src)}
                              </span>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${pct}%`, background: 'var(--color-primary)' }}
                                />
                              </div>
                              <span className="text-xs tabular-nums w-8 text-right" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                                {count}
                              </span>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Feed + Widgets ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-5">
            <section aria-label="Actividad reciente" className="lg:col-span-2 min-w-0">
              <ActivityFeed
                orders={orders}
                loading={dataLoading}
                newOrderIds={newOrderIds}
                defaultCurrency={displayCurrency}
                numberLocale={displayLocale}
              />
              {/* Productos recientes (solo en desktop debajo del feed; en móvil después de widgets) */}
              <section aria-label="Productos recientes" className="mt-5 lg:mt-6">
                <div className="dashboard-premium-card rounded-2xl border-0 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Productos recientes</h3>
                    <button
                      type="button"
                      onClick={() => navigate('/product-management')}
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                    >
                      Ver todos
                    </button>
                  </div>
                  {dataLoading ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Cargando...</p>
                  ) : (products?.length ?? 0) === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Aún no tienes productos.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {(products?.slice(0, 5) || []).map((p) => (
                        <li key={p?.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/product-editor?id=${p?.id}`)}
                            className="w-full flex items-center gap-3 text-left rounded-lg p-2 transition-colors hover:bg-muted"
                          >
                            <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                              {p?.imageUrl ? (
                                <img
                                  src={cfImageUrl(p.imageUrl, 'thumbnail')}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={buildCfImageErrorHandler(p.imageUrl)}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="Package" size={18} color="var(--color-muted-foreground)" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{p?.name || 'Sin nombre'}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                                {p?.isActive ? 'Activo' : 'Inactivo'} · {p?.price != null ? `${business?.currency || locale.currencyCode} ${Number(p.price).toLocaleString()}` : ''}
                              </p>
                            </div>
                            <Icon name="ChevronRight" size={14} color="var(--color-muted-foreground)" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </section>
            <div className="flex flex-col gap-5 min-w-0">
              <section aria-label="Tu plan">
                <PlanUsageCard data={planUsage} loading={planUsageLoading} />
              </section>
              <section aria-label="Enlace del catálogo">
                <CatalogLinkWidget
                  catalogUrl={catalogUrl}
                  businessName={business?.name || ''}
                  businessPlanSlug={activePlanSlug}
                  onCatalogShare={notifyFirstCatalogShare}
                />
              </section>
              <section aria-label="Acceso rápido">
                <QuickAccessWidget
                  catalogUrl={catalogUrl}
                  businessName={business?.name || ''}
                  businessPlanSlug={activePlanSlug}
                  onCatalogShare={notifyFirstCatalogShare}
                />
              </section>
            </div>
          </div>
        </DashboardLayoutContent>
      

      {copyToast && (
        <div className="fixed bottom-6 right-6 z-toast flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg toast-enter" style={{ backgroundColor: 'var(--color-foreground)', color: '#FFFFFF', fontFamily: 'var(--font-caption)', fontSize: '0.875rem' }} role="status" aria-live="polite">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}><Icon name="Check" size={12} color="#FFFFFF" /></div>
          ¡Enlace copiado al portapapeles!
        </div>
      )}

      <div className="fixed top-20 right-6 flex flex-col gap-3 pointer-events-none" style={{ zIndex: 400 }}>
        {newOrderToasts?.map(t => (
          <div key={t?.id} className="pointer-events-auto">
            <NewOrderToast order={t?.order} onDismiss={() => handleDismissToast(t?.id)} />
          </div>
        ))}
      </div>
    </DashboardAppShell>
  );
}
