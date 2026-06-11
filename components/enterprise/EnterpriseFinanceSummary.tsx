'use client';

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

  return (
    <div className="enterprise-value-finance-grid" data-testid="enterprise-finance-summary">
      <div className="enterprise-value-finance-card">
        <p>{mode === 'global' ? 'Valor global' : 'Valor total'}</p>
        <p>{formatEnterpriseCurrency(summary.totalValue)}</p>
      </div>
      <div className="enterprise-value-finance-card">
        <p>Valor vendido</p>
        <p>{formatEnterpriseCurrency(summary.soldValue)}</p>
      </div>
      <div className="enterprise-value-finance-card">
        <p>Valor recebido</p>
        <p>{formatEnterpriseCurrency(totalRecebido)}</p>
      </div>
      <div className="enterprise-value-finance-card">
        <p>Saldo a receber</p>
        <p>{formatEnterpriseCurrency(saldoAReceber)}</p>
      </div>
      <div className="enterprise-value-finance-card">
        <p>Valor disponível</p>
        <p>{formatEnterpriseCurrency(summary.availableValue)}</p>
      </div>
      <p className="col-span-full text-[11px] text-[var(--text-muted)] -mt-1">
        Escopo: <span className="text-[var(--text-secondary)]">{scopeLabel}</span>
      </p>
    </div>
  );
}
