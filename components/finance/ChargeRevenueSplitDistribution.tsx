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
      if (!res.ok) return null;
      return data as SaleSplitView;
    })
    .catch(() => null);
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

  if (!saleId || loading) return null;
  if (!view?.snapshot) return null;
  if (!rows.length) return null;

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
      <ul className="space-y-1 text-xs">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/5 bg-white/60 px-2 py-1.5"
          >
            <span className="font-medium text-gray-900">{row.displayName}</span>
            <span className="tabular-nums text-gray-700">{formatSharePercent(row.sharePercent)}%</span>
            <span className="text-gray-800">
              {revenueSplitLegParticipantStatusLabel({
                status: row.status,
                isIssuerRemainder: row.isIssuerRemainder,
              })}
            </span>
            {row.grossAmountEstimate != null ? (
              <span className="text-gray-500">{formatCurrencyBRL(row.grossAmountEstimate)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-amber-800">{REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING}</p>
    </section>
  );
}
