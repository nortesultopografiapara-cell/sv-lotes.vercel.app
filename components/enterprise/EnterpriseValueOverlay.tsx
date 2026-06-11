'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, DollarSign, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { useAuth } from '@/hooks/useAuth';
import { canViewEnterpriseValues } from '@/lib/rolePermissions';
import {
  calculateEnterpriseValueSummary,
  formatEnterpriseCurrency,
  type EnterpriseValueSummary,
} from '@/lib/enterpriseValueSummary';

type EnterpriseValueOverlayProps = {
  projectId: string;
  refreshKey?: number;
  className?: string;
};

const EMPTY_SUMMARY: EnterpriseValueSummary = {
  totalValue: 0,
  availableValue: 0,
  reservedValue: 0,
  soldValue: 0,
  paidValue: 0,
  availableCount: 0,
  reservedCount: 0,
  soldCount: 0,
  paidCount: 0,
  lotCount: 0,
};

export function EnterpriseValueOverlay(props: EnterpriseValueOverlayProps) {
  const { user } = useAuth();
  if (!canViewEnterpriseValues(user?.role)) {
    return null;
  }
  return <EnterpriseValueOverlayInner {...props} />;
}

function EnterpriseValueOverlayInner({
  projectId,
  refreshKey = 0,
  className = '',
}: EnterpriseValueOverlayProps) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<EnterpriseValueSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (!projectId || !user || !canViewEnterpriseValues(user.role)) {
        setSummary(EMPTY_SUMMARY);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const rlsCtx = await resolveRlsContext(user);
        let query = supabase
          .from('blocks')
          .select('project_id, status, price')
          .eq('project_id', projectId);
        query = applyTenantFilter(query, rlsCtx, 'blocks');
        const { data, error } = await query;
        if (error) throw error;
        if (cancelled) return;
        setSummary(calculateEnterpriseValueSummary(data || []));
      } catch (error) {
        console.error('ENTERPRISE_VALUE_OVERLAY_ERROR', error);
        if (!cancelled) setSummary(EMPTY_SUMMARY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [projectId, user, refreshKey]);

  const soldLabel = useMemo(() => {
    if (summary.paidCount > 0) {
      return `Vendido/Quitado: ${summary.soldCount + summary.paidCount} lotes`;
    }
    return `Vendido: ${summary.soldCount} lotes`;
  }, [summary.paidCount, summary.soldCount]);

  return (
    <div
      className={`enterprise-value-overlay ${className}`.trim()}
      data-testid="enterprise-value-overlay"
    >
      <div className="enterprise-value-overlay__header">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] truncate">
            Valor do Empreendimento
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="enterprise-value-overlay__toggle"
          aria-label={collapsed ? 'Expandir resumo' : 'Recolher resumo'}
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!collapsed && (
        <div className="enterprise-value-overlay__body">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Calculando…
            </div>
          ) : (
            <>
              <p className="enterprise-value-overlay__total">
                {formatEnterpriseCurrency(summary.totalValue)}
              </p>
              <div className="enterprise-value-overlay__rows">
                <p>
                  <span className="text-emerald-400">Disponível:</span>{' '}
                  {formatEnterpriseCurrency(summary.availableValue)} | {summary.availableCount} lotes
                </p>
                <p>
                  <span className="text-amber-400">Reservado:</span>{' '}
                  {formatEnterpriseCurrency(summary.reservedValue)} | {summary.reservedCount} lotes
                </p>
                <p>
                  <span className="text-rose-400">Vendido:</span>{' '}
                  {formatEnterpriseCurrency(summary.soldValue)} | {soldLabel}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
