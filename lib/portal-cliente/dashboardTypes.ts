import type { ClientPortalLinkType } from '@/lib/portal-cliente/types';

export type ClientPortalInstallmentStatus = 'paid' | 'open' | 'overdue' | 'cancelled';

export type ClientPortalDashboardSummary = {
  greetingName: string;
  customerNameMasked: string;
  companyName: string;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  quadraLote: string | null;
  contractStatusLabel: string | null;
  financialStatusLabel: string;
  nextDueDate: string | null;
  paidCount: number;
  openCount: number;
  overdueCount: number;
};

export type ClientPortalDashboardContract = {
  contractNumber: string | null;
  statusLabel: string | null;
  signatureStatusLabel: string | null;
  signUrl: string | null;
  contractPdfUrl: string | null;
  validationUrl: string | null;
};

export type ClientPortalDashboardInstallment = {
  installmentNumber: number;
  dueDate: string;
  amountLabel: string;
  status: ClientPortalInstallmentStatus;
  statusLabel: string;
  paidAt: string | null;
  paymentUrl: string | null;
  pixCopyPaste: string | null;
};

export type ClientPortalDashboardFinance = {
  summary: Pick<
    ClientPortalDashboardSummary,
    'financialStatusLabel' | 'nextDueDate' | 'paidCount' | 'openCount' | 'overdueCount'
  >;
  installments: ClientPortalDashboardInstallment[];
};

export type ClientPortalDashboardResponse = {
  ok: true;
  linkType: ClientPortalLinkType;
  summary: ClientPortalDashboardSummary;
  contract: ClientPortalDashboardContract | null;
  finance: ClientPortalDashboardFinance | null;
  companyWhatsAppUrl: string | null;
  message: string | null;
};

export type ClientPortalDashboardErrorResponse = {
  ok: false;
  code: 'UNAUTHORIZED' | 'EXPIRED' | 'NOT_FOUND' | 'DISABLED';
  message: string;
};
