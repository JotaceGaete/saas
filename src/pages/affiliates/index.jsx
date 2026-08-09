import React, { useCallback, useEffect, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import MetricCard from '../dashboard/components/MetricCard';
import { getMyReferralStats, listMyReferrals } from '../../services/referralService';

const REFERRAL_BASE_URL = 'https://ventalink.app/?ref=';

/**
 * Mapeo 1:1 de los 4 estados reales de referral_commissions.status
 * (pending | approved | reversed | paid, sin cambios desde Parte 1) a los
 * 3 montos agregados que expone wa_get_my_referral_stats():
 *   pendingAmount     = SUM(status = 'pending')
 *   availableAmount   = SUM(status = 'approved')
 *   totalEarnedAmount = SUM(status IN ('approved', 'paid'))  -- reversed nunca cuenta
 * El MVP no lista comisiones individuales por estado, solo estos 3 totales.
 */

function formatMoney(amount, currency) {
  const value = Number(amount ?? 0);
  return `${currency || 'USD'} ${value.toFixed(2)}`;
}

export default function AffiliatesPage() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  const [referrals, setReferrals] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const [copied, setCopied] = useState(false);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    setStatsError(false);
    getMyReferralStats()
      .then((data) => setStats(data))
      .catch((err) => {
        console.warn('[AffiliatesPage] getMyReferralStats failed:', err?.message);
        setStatsError(true);
      })
      .finally(() => setStatsLoading(false));
  }, []);

  const loadReferrals = useCallback(() => {
    setListLoading(true);
    setListError(false);
    listMyReferrals({ limit: 20, offset: 0 })
      .then((data) => setReferrals(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.warn('[AffiliatesPage] listMyReferrals failed:', err?.message);
        setListError(true);
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    loadStats();
    loadReferrals();
  }, [loadStats, loadReferrals]);

  const referralUrl = stats?.code ? `${REFERRAL_BASE_URL}${stats.code}` : '';
  const rewardAmountLabel = stats ? formatMoney(stats.rewardAmount, stats.rewardCurrency) : '';
  const requiredPaidMonths = stats?.requiredPaidMonths ?? 2;

  const handleCopy = () => {
    if (!referralUrl) return;
    navigator.clipboard?.writeText(referralUrl)?.catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Programa de Afiliados
          </h1>
        }
        subtitle={
          <p className="text-xs hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {stats
              ? `Ganas ${rewardAmountLabel} cuando un referido completa ${requiredPaidMonths} meses pagos.`
              : 'Cargando tus condiciones del programa...'}
          </p>
        }
      />

      <DashboardLayoutContent>
        {/* ── Mensaje de confianza (móvil, siempre visible) ─────────────── */}
        <p className="text-sm sm:hidden" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {stats
            ? `Ganas ${rewardAmountLabel} cuando un referido completa ${requiredPaidMonths} meses pagos.`
            : 'Cargando tus condiciones del programa...'}
        </p>

        {/* ── Card del enlace ────────────────────────────────────────────── */}
        <div className="dashboard-premium-card rounded-2xl border-0 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="Gift" size={16} color="var(--color-primary)" />
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
              Tu enlace
            </h2>
          </div>

          {statsError ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border mb-2" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
              <Icon name="AlertTriangle" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
              <span className="flex-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                No pudimos cargar tu enlace de afiliado.
              </span>
              <button
                type="button"
                onClick={loadStats}
                className="text-xs font-medium underline flex-shrink-0"
                style={{ color: 'var(--color-primary)' }}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg border mb-4" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
                <Icon name="Link" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
                <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-data)' }}>
                  {referralUrl || (statsLoading ? 'Generando enlace…' : '')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!referralUrl}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: copied ? 'rgba(16,185,129,0.12)' : 'rgba(124,58,237,0.08)',
                  color: copied ? '#059669' : 'var(--color-primary)',
                  fontFamily: 'var(--font-caption)',
                  border: `1px solid ${copied ? 'rgba(16,185,129,0.25)' : 'var(--color-border)'}`,
                }}
              >
                <Icon name={copied ? 'Check' : 'Copy'} size={13} color={copied ? '#059669' : 'var(--color-primary)'} />
                {copied ? '¡Copiado!' : 'Copiar enlace'}
              </button>
            </>
          )}
        </div>

        {/* ── Métricas de referidos ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard
            title="Referidos totales"
            value={stats?.invitedCount ?? 0}
            iconName="Users"
            loading={statsLoading}
          />
          <MetricCard
            title="Con progreso"
            value={stats?.oneMonthCount ?? 0}
            subtitle={`1 de ${requiredPaidMonths} meses`}
            iconName="Clock"
            loading={statsLoading}
          />
          <MetricCard
            title="Calificados"
            value={stats?.qualifiedCount ?? 0}
            subtitle={`${requiredPaidMonths} de ${requiredPaidMonths} meses`}
            iconName="CheckCircle2"
            variant="success"
            loading={statsLoading}
          />
        </div>

        {/* ── Métricas de recompensas ────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            title="Pendiente"
            value={stats ? formatMoney(stats.pendingAmount, stats.rewardCurrency) : '—'}
            iconName="Hourglass"
            loading={statsLoading}
          />
          <MetricCard
            title="Disponible"
            value={stats ? formatMoney(stats.availableAmount, stats.rewardCurrency) : '—'}
            iconName="Wallet"
            variant="success"
            loading={statsLoading}
          />
          <MetricCard
            title="Total ganado"
            value={stats ? formatMoney(stats.totalEarnedAmount, stats.rewardCurrency) : '—'}
            iconName="TrendingUp"
            loading={statsLoading}
          />
        </div>

        {/* ── Últimos referidos ───────────────────────────────────────────── */}
        <div className="dashboard-premium-card rounded-2xl border-0 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="List" size={16} color="var(--color-primary)" />
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
              Últimos referidos
            </h2>
          </div>

          {listError ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'var(--color-muted)', borderColor: 'var(--color-border)' }}>
              <Icon name="AlertTriangle" size={13} color="var(--color-muted-foreground)" className="flex-shrink-0" />
              <span className="flex-1 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                No pudimos cargar tus referidos.
              </span>
              <button
                type="button"
                onClick={loadReferrals}
                className="text-xs font-medium underline flex-shrink-0"
                style={{ color: 'var(--color-primary)' }}
              >
                Reintentar
              </button>
            </div>
          ) : listLoading ? (
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Cargando…
            </p>
          ) : referrals.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Todavía no tienes referidos. Comparte tu enlace para empezar.
            </p>
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {referrals.map((r, idx) => (
                <li key={idx} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                    {r.publicLabel}
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                    style={{
                      backgroundColor: r.qualified ? 'rgba(16,185,129,0.1)' : 'var(--color-muted)',
                      color: r.qualified ? '#059669' : 'var(--color-muted-foreground)',
                      fontFamily: 'var(--font-caption)',
                    }}
                  >
                    {r.paidMonths}/{requiredPaidMonths}
                    {r.qualified ? <Icon name="Check" size={11} color="#059669" /> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
