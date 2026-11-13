'use client';

import { FileText, Landmark, Package, TrendingUp, Wallet } from 'lucide-react';
import { FinanceStatCard } from '@/components/finance/FinancePremiumUI';
import {
  formatEnterpriseCurrency,
  type EnterpriseValueSummary,
} from '@/lib/enterpriseValueSummary';

type EnterpriseFinanceSummaryProps = {
  summary: EnterpriseValueSummary;
  totalRecebido: number;
  saldoAReceber: number;
  projectName: string;
  mode?: 'global' | 'project';
  /** Parcelas ainda incompletas: os dois cards de recebimento ficam sem valor. */
  receiptTotalsReady?: boolean;
  /** Lotes ainda incompletos: os cards de valor do empreendimento ficam sem valor. */
  lotsReady?: boolean;
};

export function EnterpriseFinanceSummary({
  summary,
  totalRecebido,
  saldoAReceber,
  projectName,
  mode = 'project',
  receiptTotalsReady = true,
  lotsReady = true,
}: EnterpriseFinanceSummaryProps) {
  const scopeLabel =
    mode === 'global' ? 'Todos os empreendimentos' : projectName;
  const soldLotCount = summary.soldCount + summary.paidCount;

  return (
    <div className="enterprise-value-finance-grid" data-testid="enterprise-finance-summary">
      <FinanceStatCard
        title={mode === 'global' ? 'Valor Global' : 'Valor total'}
        value={formatEnterpriseCurrency(summary.totalValue)}
        subtitle={lotsReady ? scopeLabel : 'Carregando lotes'}
        icon={<Landmark />}
        iconWrapClass="bg-violet-500/12 text-violet-400"
        loading={!lotsReady}
      />
      <FinanceStatCard
        title="Valor Disponível"
        value={formatEnterpriseCurrency(summary.availableValue)}
        subtitle={lotsReady ? `${summary.availableCount} lotes disponíveis` : 'Carregando lotes'}
        icon={<Package />}
        iconWrapClass="bg-emerald-500/12 text-emerald-400"
        loading={!lotsReady}
      />
      <FinanceStatCard
        title="Valor Vendido"
        value={formatEnterpriseCurrency(summary.soldValue)}
        subtitle={lotsReady ? `${soldLotCount} lotes vendidos/quitados` : 'Carregando lotes'}
        icon={<TrendingUp />}
        iconWrapClass="bg-rose-500/12 text-rose-400"
        loading={!lotsReady}
      />
      <FinanceStatCard
        title="Valor recebido"
        value={formatEnterpriseCurrency(totalRecebido)}
        subtitle="Pagamentos registrados"
        icon={<Wallet />}
        iconWrapClass="bg-emerald-500/12 text-emerald-400"
        loading={!receiptTotalsReady}
      />
      <FinanceStatCard
        title="Saldo a receber"
        value={formatEnterpriseCurrency(saldoAReceber)}
        subtitle="Parcelas em aberto"
        icon={<FileText />}
        iconWrapClass="bg-blue-500/12 text-blue-400"
        loading={!receiptTotalsReady}
      />
    </div>
  );
}
