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
import { formatSharePercent } from '@/lib/finance/revenueSplit/shareFormat';
import { formatCurrencyBRL } from '@/lib/currencyBrl';

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
      className={
        compact
          ? 'mt-3 rounded-lg border border-teal-500/20 bg-teal-500/[0.04] p-3'
          : 'rounded-xl border border-teal-500/25 bg-teal-500/[0.05] p-3 sm:p-4'
      }
      data-testid="charge-revenue-split-distribution"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary,theme(colors.gray.900))]">
          Distribuição do Recebimento
        </h4>
        {splitStatus ? (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
            Status do Split: {REVENUE_SPLIT_LEG_STATUS_LABELS[splitStatus]}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-[var(--text-secondary,theme(colors.gray.600))]">
        Pagamento: <strong>{paymentLabel(paymentStatus)}</strong>
      </p>
      {loading && !view?.snapshot ? (
        <p className="text-xs text-[var(--text-muted,theme(colors.gray.500))]">
          Carregando distribuição...
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-600">
                <th className="pb-1 pr-2 font-semibold">Beneficiário</th>
                <th className="pb-1 pr-2 font-semibold">Percentual</th>
                <th className="pb-1 pr-2 font-semibold">Situação</th>
                <th className="pb-1 font-semibold text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-black/5">
                  <td className="py-1.5 pr-2 font-medium text-gray-900">{row.displayName}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-gray-700">
                    {formatSharePercent(row.sharePercent)}%
                  </td>
                  <td className="py-1.5 pr-2 text-gray-800">
                    {revenueSplitLegParticipantStatusLabel({
                      status: row.status,
                      isIssuerRemainder: row.isIssuerRemainder,
                    })}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500">
                    {row.grossAmountEstimate != null
                      ? formatCurrencyBRL(row.grossAmountEstimate)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-amber-800">{REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING}</p>
    </section>
  );
}
