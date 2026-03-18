import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BusinessSidebar from "components/ui/BusinessSidebar";
import PanelHeader from "components/ui/PanelHeader";
import { useIsDesktop } from "hooks/useMediaQuery";
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
  getBusinessVisitStats,
  getPendingOrdersCount,
  getWeeklyOrdersCount,
  getPlanUsage,
  getEffectivePlanSlug,
} from "../../services/waBusinessService";
import { supabase } from "../../lib/supabase";
import { getAppBaseUrl } from "../../config/appUrl";
import { getPublicCatalogUrl } from "../../config/appUrl";
import OrdersByDayCard from "./components/OrdersByDayCard";
import TopProductsCard from "./components/TopProductsCard";
import MonthlyRevenueCard from "./components/MonthlyRevenueCard";
import PlanUsageCard from "./components/PlanUsageCard";
import TrialConversionBanner from "./components/TrialConversionBanner";
import MobilePreviewPanel from "../business-configuration/components/MobilePreviewPanel";
import { getCatalogShareMessage } from "../../utils/branding";
import { getCountryLabels } from "../../config/country";


export default function Dashboard() {
  const navigate = useNavigate();
  const { user, business, businessLoading, refreshBusiness } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dashboardRefreshAttempted = useRef(false);
  const [copyToast, setCopyToast] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [ordersByDay, setOrdersByDay] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState(null);
  const [visitStats, setVisitStats] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [weeklyOrdersCount, setWeeklyOrdersCount] = useState(0);
  const [planUsage, setPlanUsage] = useState(null);
  const [planUsageLoading, setPlanUsageLoading] = useState(true);
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
  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  // Para la UI del dashboard consideramos Starter cuando el slug actual es 'starter'.
  // Solo Pro / Business (incluyendo trials vigentes) ven estadísticas avanzadas.
  const isStarterPlan = (business?.planSlug || 'starter') === 'starter';
  const isPaidPlan = business?.planSlug === 'pro' || business?.planSlug === 'business';
  const isPlanExpired = isPaidPlan && planExpiresAt && new Date(planExpiresAt) <= new Date();
  const showExpiredBanner = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('showPlanExpiredBanner') === '1';

  // Pro Trial: plan pro/business, trial activo (trialExpiresAt en el futuro), sin plan pagado (sin planExpiresAt)
  const isProTrial =
    (business?.planSlug === 'pro' || business?.planSlug === 'business') &&
    trialExpiresAt &&
    new Date(trialExpiresAt) > new Date() &&
    !planExpiresAt;
  const trialDaysLeft = isProTrial && trialExpiresAt
    ? Math.ceil((new Date(trialExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))
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
      const [dayRes, topRes, revRes, visitRes] = await Promise.all([
        getOrdersByDay(business?.id, 7),
        getTopProducts(business?.id, 5),
        getMonthlyRevenue(business?.id),
        getBusinessVisitStats(business?.id),
      ]);
      setOrdersByDay(dayRes?.data || []);
      setTopProducts(topRes?.data || []);
      setMonthlyRevenue(revRes?.data || null);
      setVisitStats(visitRes?.data ?? null);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setAnalyticsLoading(false);
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

  useEffect(() => {
    if (!business?.id) { setPlanUsageLoading(false); return; }
    loadPlanUsage();
  }, [business?.id, loadPlanUsage]);

  useEffect(() => {
    if (!business?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData();
        loadAnalytics();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [business?.id, loadDashboardData, loadAnalytics]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!business?.id) return;

    const channelName = `wa_orders_business_${business?.id}`;
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
  if (!dataLoading && products?.length === 0) {
    alerts.push({
      id: 'no-products',
      icon: 'Package',
      color: 'var(--color-primary)',
      bg: 'rgba(124,58,237,0.06)',
      border: 'rgba(124,58,237,0.2)',
      text: 'Tu catálogo aún no tiene productos',
      action: 'Agregar',
      onAction: () => navigate('/product-editor'),
    });
  }
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

  const handleCopy = () => {
    if (!catalogUrl) return;
    navigator.clipboard?.writeText(catalogUrl)?.catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2500);
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
  };

  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

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
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200" style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}>
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

        <div className="px-4 md:px-6 lg:pl-4 lg:pr-6 py-5 lg:py-6 page-enter pb-20 lg:pb-8 w-full max-w-full min-w-0" style={{ maxWidth: '1100px' }}>

          {/* Banner: negocio sin configurar */}
          {!business && !businessLoading && (
            <div className="mb-5 flex items-start gap-3 p-4 rounded-xl border slide-up" style={{ backgroundColor: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}>
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
            <div className="mb-5 flex items-start gap-3 p-4 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
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
            <div className="mb-5 flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
              <Icon name="Calendar" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-text-secondary)' }}>
                Tu plan vence el: <strong>{new Date(planExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </span>
              <button onClick={() => navigate('/planes')} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>Ver planes</button>
            </div>
          )}

          {/* Getting Started */}
          <GettingStartedSection
            productCount={products?.length ?? 0}
            business={business}
            catalogUrl={catalogUrl}
            onCopy={handleCopy}
          />

          {/* ── Bloque de alertas ── */}
          {alerts.length > 0 && (
            <section className="mb-6">
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

          {/* ── Métricas principales (Starter solo ve Total productos) ── */}
          <section aria-label="Métricas del negocio" className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
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
            <section aria-label="Analíticas" className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
                <div className="stagger-item min-w-0"><OrdersByDayCard data={ordersByDay} loading={analyticsLoading} /></div>
                <div className="stagger-item min-w-0"><TopProductsCard data={topProducts} loading={analyticsLoading} /></div>
                <div className="stagger-item min-w-0"><MonthlyRevenueCard data={monthlyRevenue} loading={analyticsLoading} /></div>
              </div>
            </section>
          )}

          {/* ── Feed + Widgets ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-5">
            <section aria-label="Actividad reciente" className="lg:col-span-2 min-w-0">
              <ActivityFeed orders={orders} loading={dataLoading} newOrderIds={newOrderIds} />
              {/* Productos recientes (solo en desktop debajo del feed; en móvil después de widgets) */}
              <section aria-label="Productos recientes" className="mt-5 lg:mt-6">
                <div className="rounded-xl border p-4" style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}>
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
                                <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="Package" size={18} color="var(--color-muted-foreground)" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>{p?.name || 'Sin nombre'}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                                {p?.isActive ? 'Activo' : 'Inactivo'} · {p?.price != null ? `${business?.currency || getCountryLabels().currency} ${Number(p.price).toLocaleString()}` : ''}
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
                <CatalogLinkWidget catalogUrl={catalogUrl} businessName={business?.name || ''} businessPlanSlug={business?.planSlug} />
              </section>
              <section aria-label="Acceso rápido">
                <QuickAccessWidget catalogUrl={catalogUrl} businessName={business?.name || ''} businessPlanSlug={business?.planSlug} />
              </section>
              <section aria-label="Prueba email">
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}
                >
                  {sendingTestEmail ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon name="Mail" size={16} color="currentColor" />
                  )}
                  Enviar email de prueba
                </button>
              </section>
              {business?.id && (
                <section aria-label="Vista previa del catálogo">
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: '#f7f7f9' }}>
                    <p className="text-xs font-semibold px-3 py-2" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Vista previa móvil</p>
                    <div className="flex justify-center p-3">
                      <MobilePreviewPanel
                        storeName={business?.name || 'Mi Tienda'}
                        storeSlug={business?.slug || ''}
                        logoUrl={business?.logoUrl || business?.designSettings?.logoUrl}
                        coverImageUrl={business?.coverImageUrl || business?.designSettings?.headerImageUrl}
                        products={products || []}
                        currency={business?.currency || getCountryLabels().currency}
                        design={business?.designSettings || {}}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

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
    </div>
  );
}
