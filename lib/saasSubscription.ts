/**
 * Assinaturas SaaS — tipos, labels e helpers de data.
 */

export type SaasPaymentStatus = 'pending' | 'paid' | 'overdue' | 'canceled';
export type SaasContractStatus =
  | 'pending'
  | 'draft'
  | 'generated'
  | 'sent'
  | 'signed'
  | 'active'
  | 'suspended'
  | 'canceled'
  | 'cancelled';

export type CompanySubscription = {
  id: string;
  company_id: string;
  plan_type: string;
  monthly_price: number;
  custom_price_enabled: boolean;
  custom_monthly_price?: number | null;
  billing_cycle: string;
  start_date: string;
  first_payment_date?: string | null;
  next_due_date?: string | null;
  payment_status: SaasPaymentStatus | string;
  contract_status: SaasContractStatus | string;
  contract_number?: string | null;
  contract_pdf_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const SAAS_PAYMENT_LABELS: Record<string, string> = {
  pending: 'Aguardando cobrança',
  paid: 'Pago',
  overdue: 'Vencido',
  canceled: 'Cancelado',
};

export function formatSaasPaymentStatus(status?: string | null): string {
  const key = (status || 'pending').toLowerCase().trim();
  return SAAS_PAYMENT_LABELS[key] || status || 'Aguardando cobrança';
}

export function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

import {
  formatCompanyContractNumber,
  isNewFormatCompanyContractNumber,
} from '@/lib/companyContractNumber';

/** @deprecated Use generateNextCompanyContractNumber() no servidor. */
export function generateSaasContractNumber(): string {
  return formatCompanyContractNumber(1);
}

export function isLegacySaasContractNumber(value: string | null | undefined): boolean {
  return Boolean(value && /^SAAS-\d{4}-/.test(String(value).trim()));
}

export { isNewFormatCompanyContractNumber };

export function contractDownloadPath(companyId: string): string {
  return `/api/companies/${companyId}/contract?download=1`;
}

export function isRealSaasCompany(company: {
  is_test_company?: boolean | null;
  is_test?: boolean | null;
}): boolean {
  return company.is_test_company !== true && company.is_test !== true;
}

export function hasSaasContractReady(sub?: CompanySubscription | null): boolean {
  if (!sub) return false;
  if (Boolean(sub.contract_pdf_url)) return true;
  const status = (sub.contract_status || '').toLowerCase();
  return ['active', 'generated', 'sent', 'signed'].includes(status);
}
