import {
  calculateMrrFromCompanies,
  formatSaasCurrency,
  getCompanyMonthlyPrice,
  isBillableCompany,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import { formatDateBr } from '@/lib/saasSubscription';
import type { MasterSaasPayment } from '@/lib/masterSaasPayments';
import type { CompanySubscription } from '@/lib/saasSubscription';

export type MasterReportsMetrics = {
  registeredCompanies: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  annualRevenue: number;
  delinquencyAmount: number;
  delinquentCompanies: number;
  rows: MasterReportRow[];
};

export type MasterReportRow = {
  companyId: string;
  companyName: string;
  plan: string;
  companyStatus: string;
  financialSituation: string;
  lastPaymentDate: string;
  lastPaymentReference: string;
  nextDueDate: string;
  monthlyPrice: number;
  daysLate: number;
};

export function computeDaysLate(nextDueDate?: string | null): number {
  if (!nextDueDate) return 0;
  const due = new Date(`${nextDueDate.split('T')[0]}T12:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export function buildMasterReportsMetrics(
  companies: CompanyPricingSource[],
  subscriptions: CompanySubscription[] = [],
  paidReferenceMonths: Map<string, Set<string>> = new Map(),
  payments: MasterSaasPayment[] = [],
): MasterReportsMetrics {
  const subMap = new Map(subscriptions.map((s) => [s.company_id, s]));
  let activeSubscriptions = 0;
  let delinquencyAmount = 0;
  let delinquentCompanies = 0;
  const rows: MasterReportRow[] = [];

  companies.forEach((company) => {
    const subscription = subMap.get(company.id as string) ?? null;
    const enriched = augmentCompanyBilling(company, subscription, {
      paidReferenceMonths,
      payments,
    });
    const monthlyPrice = getCompanyMonthlyPrice(company);
    const isActive = isBillableCompany(company);
    if (isActive && subscription?.contract_status !== 'canceled') {
      activeSubscriptions++;
    }

    const isDelinquent = enriched.financial_situation === 'VENCIDO';

    if (isDelinquent && isActive) {
      delinquencyAmount += monthlyPrice;
      delinquentCompanies++;
    }

    rows.push({
      companyId: String(company.id || ''),
      companyName: String(company.name || company.fantasy_name || '—'),
      plan: enriched.ui_plan,
      companyStatus: enriched.company_operational_status,
      financialSituation: enriched.financial_situation,
      lastPaymentDate: enriched.last_payment_date
        ? formatDateBr(enriched.last_payment_date)
        : '—',
      lastPaymentReference: enriched.last_payment_reference_label || '—',
      nextDueDate: enriched.next_payment_date
        ? formatDateBr(enriched.next_payment_date)
        : '—',
      monthlyPrice,
      daysLate: enriched.days_late,
    });
  });

  const monthlyRevenue = calculateMrrFromCompanies(companies);

  return {
    registeredCompanies: companies.length,
    activeSubscriptions,
    monthlyRevenue,
    annualRevenue: monthlyRevenue * 12,
    delinquencyAmount,
    delinquentCompanies,
    rows,
  };
}

export function masterReportsToCsv(metrics: MasterReportsMetrics): string {
  const header = [
    'Empresa',
    'Plano',
    'Status da empresa',
    'Situação financeira',
    'Último pagamento',
    'Referência paga',
    'Próximo vencimento',
    'Mensalidade',
    'Atraso',
  ].join(';');

  const lines = metrics.rows.map((row) =>
    [
      row.companyName,
      row.plan,
      row.companyStatus,
      row.financialSituation,
      row.lastPaymentDate,
      row.lastPaymentReference,
      row.nextDueDate,
      row.monthlyPrice.toFixed(2).replace('.', ','),
      row.daysLate > 0 ? `${row.daysLate} dias` : '—',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(';'),
  );

  return [header, ...lines].join('\n');
}

export function formatMasterCurrency(value: number): string {
  return formatSaasCurrency(value);
}
