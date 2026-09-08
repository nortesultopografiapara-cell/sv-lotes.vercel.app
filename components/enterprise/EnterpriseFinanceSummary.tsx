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
};

export function EnterpriseFinanceSummary({
  summary,
  totalRecebido,
  saldoAReceber,
  projectName,
  mode = 'project',
}: EnterpriseFinanceSummaryProps) {
  const scopeLabel =
    mode === 'global' ? 'Todos os empreendimentos' : projectName;
  const soldLotCount = summary.soldCount + summary.paidCount;

  return (
    <div className="enterprise-value-finance-grid" data-testid="enterprise-finance-summary">
      <FinanceStatCard
        title={mode === 'global' ? 'Valor Global' : 'Valor total'}
        value={formatEnterpriseCurrency(summary.totalValue)}
        subtitle={scopeLabel}
        icon={<Landmark />}
        iconWrapClass="bg-violet-500/12 text-violet-400"
      />
      <FinanceStatCard
        title="Valor Disponível"
        value={formatEnterpriseCurrency(summary.availableValue)}
        subtitle={`${summary.availableCount} lotes disponíveis`}
        icon={<Package />}
        iconWrapClass="bg-emerald-500/12 text-emerald-400"
      />
      <FinanceStatCard
        title="Valor Vendido"
        value={formatEnterpriseCurrency(summary.soldValue)}
        subtitle={`${soldLotCount} lotes vendidos/quitados`}
        icon={<TrendingUp />}
        iconWrapClass="bg-rose-500/12 text-rose-400"
      />
      <FinanceStatCard
        title="Valor recebido"
        value={formatEnterpriseCurrency(totalRecebido)}
        subtitle="Pagamentos registrados"
        icon={<Wallet />}
        iconWrapClass="bg-emerald-500/12 text-emerald-400"
      />
      <FinanceStatCard
        title="Saldo a receber"
        value={formatEnterpriseCurrency(saldoAReceber)}
        subtitle="Parcelas em aberto"
        icon={<FileText />}
        iconWrapClass="bg-blue-500/12 text-blue-400"
      />
    </div>
  );
}
