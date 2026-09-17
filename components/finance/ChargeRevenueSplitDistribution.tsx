'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING,
  REVENUE_SPLIT_LEG_STATUS_LABELS,
  revenueSplitLegParticipantStatusLabel,
  summarizeRevenueSplitLegsStatus,
} from '@/lib/finance/revenueSplit/display';
import type {
  ChargeRevenueSplitLeg,
  RevenueSplitLegStatus,
  SaleRevenueSplitSnapshotParticipant,
} from '@/lib/finance/revenueSplit/types';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  formatSplitBeneficiaryLabel,
  formatSplitSharePercentLabel,
  splitStatusPresentationTone,
} from '@/lib/finance/reports/splitPresentation';

type SaleSplitView = {
  saleId: string;
  operational: boolean;
  snapshot: { id: string } | null;
  participants: SaleRevenueSplitSnapshotParticipant[];
  legs: ChargeRevenueSplitLeg[];
};

const viewCache = new Map<string, Promise<SaleSplitView | null>>();

function loadSaleSplitView(saleId: string): Promise<SaleSplitView | null> {
  const cached = viewCache.get(saleId);
  if (cached) return cached;
  const pending = fetch(`/api/finance/revenue-split/sales/${encodeURIComponent(saleId)}`, {
    credentials: 'include',
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        viewCache.delete(saleId);
        return null;
      }
      const view = data as SaleSplitView;
      if (!view?.snapshot) viewCache.delete(saleId);
      return view;
    })
    .catch(() => {
      viewCache.delete(saleId);
      return null;
    });
  viewCache.set(saleId, pending);
  return pending;
}

export function invalidateSaleRevenueSplitView(saleId?: string | null) {
  if (saleId) viewCache.delete(saleId);
  else viewCache.clear();
}

function paymentLabel(status?: string | null): string {
  const raw = String(status || '').toLowerCase();
  if (raw === 'pago' || raw === 'paid') return 'Pago';
  if (raw === 'atrasado' || raw === 'overdue') return 'Atrasado';
  if (raw === 'cancelado' || raw === 'cancelled') return 'Cancelado';
  return 'Pendente';
}

type Props = {
  saleId?: string | null;
  installmentId?: string | null;
  paymentStatus?: string | null;
  compact?: boolean;
};

export function ChargeRevenueSplitDistribution({
  saleId,
  installmentId,
  paymentStatus,
  compact = false,
}: Props) {
  const [view, setView] = useState<SaleSplitView | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = String(saleId || '').trim();
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadSaleSplitView(id).then((next) => {
      if (cancelled) return;
      setView(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const legs = useMemo(() => {
    if (!view?.legs?.length) return [];
    const filtered = installmentId
      ? view.legs.filter((leg) => leg.installmentId === installmentId)
      : view.legs;
    return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  }, [view, installmentId]);

  const participants = view?.participants || [];
  const rows =
    legs.length > 0
      ? legs
      : participants.map((row) => ({
          id: row.id,
          displayName: row.displayName,
          sharePercent: row.sharePercent,
          isIssuerRemainder: row.isIssuerRemainder,
          status: 'PENDING' as RevenueSplitLegStatus,
          grossAmountEstimate: null as number | null,
        }));

  if (!saleId) return null;
  if (!loading && !view?.snapshot) return null;
  if (!loading && !rows.length) return null;

  const splitStatus = summarizeRevenueSplitLegsStatus(
    legs.map((leg) => leg.status),
  );

  return (
    <section
      className={`finance-split-distribution${compact ? ' is-compact' : ''}`}
      data-testid="charge-revenue-split-distribution"
    >
      <div className="finance-split-distribution-head">
        <h4>Distribuição do Recebimento</h4>
        {splitStatus ? (
          <span className="finance-split-chip">
            Status do Split: {REVENUE_SPLIT_LEG_STATUS_LABELS[splitStatus]}
          </span>
        ) : null}
      </div>
      <p className="finance-split-payment">
        Pagamento: <strong>{paymentLabel(paymentStatus)}</strong>
      </p>
      {loading && !view?.snapshot ? (
        <p className="finance-split-loading">Carregando distribuição...</p>
      ) : (
        <div className="finance-split-table-wrap">
          <table className="finance-split-table">
            <thead>
              <tr>
                <th>Beneficiário</th>
                <th>Percentual</th>
                <th>Situação</th>
                <th className="is-amount">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const situation = revenueSplitLegParticipantStatusLabel({
                  status: row.status,
                  isIssuerRemainder: row.isIssuerRemainder,
                });
                const tone = splitStatusPresentationTone(situation);
                return (
                  <tr key={row.id}>
                    <td className="finance-split-beneficiary">
                      {formatSplitBeneficiaryLabel(row.displayName)}
                    </td>
                    <td className="finance-split-percent">
                      {formatSplitSharePercentLabel(row.sharePercent)}
                    </td>
                    <td>
                      <span className={`finance-split-status is-${tone}`}>{situation}</span>
                    </td>
                    <td className="finance-split-amount">
                      {row.grossAmountEstimate != null
                        ? formatCurrencyBRL(row.grossAmountEstimate)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="finance-split-hint">{REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING}</p>
    </section>
  );
}
