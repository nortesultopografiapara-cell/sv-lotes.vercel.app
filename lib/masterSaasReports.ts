import {
  calculateMrrFromCompanies,
  formatSaasCurrency,
  getCompanyMonthlyPrice,
  isBillableCompany,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { augmentCompanyBilling } from '@/lib/masterBilling';
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
  status: string;
  paymentStatus: string;
  monthlyPrice: number;
  nextDueDate: string;
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
    });
    const monthlyPrice = getCompanyMonthlyPrice(company);
    const isActive = isBillableCompany(company);
    if (isActive && subscription?.contract_status !== 'canceled') {
      activeSubscriptions++;
    }

    const isDelinquent =
      enriched.subscription_status === 'Inadimplente' ||
      subscription?.payment_status === 'overdue' ||
      (company.status_operacional || '').toLowerCase() === 'inadimplente';

    if (isDelinquent && isActive) {
      delinquencyAmount += monthlyPrice;
      delinquentCompanies++;
    }

    rows.push({
      companyId: String(company.id || ''),
      companyName: String(company.name || company.fantasy_name || '—'),
      plan: enriched.ui_plan,
      status: enriched.subscription_status,
      paymentStatus: enriched.payment_status,
      monthlyPrice,
      nextDueDate: enriched.next_payment_date || '—',
      daysLate: computeDaysLate(enriched.next_payment_date),
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
    'Status',
    'Pagamento',
    'Mensalidade',
    'Proximo vencimento',
    'Dias atraso',
  ].join(';');

  const lines = metrics.rows.map((row) =>
    [
      row.companyName,
      row.plan,
      row.status,
      row.paymentStatus,
      row.monthlyPrice.toFixed(2).replace('.', ','),
      row.nextDueDate,
      String(row.daysLate),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(';'),
  );

  return [header, ...lines].join('\n');
}

export function formatMasterCurrency(value: number): string {
  return formatSaasCurrency(value);
}
