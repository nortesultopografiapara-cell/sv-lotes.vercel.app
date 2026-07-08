import type { ClientPortalLinkType } from '@/lib/portal-cliente/types';

export type ClientPortalInstallmentStatus =
  | 'paid'
  | 'open'
  | 'overdue'
  | 'negotiation'
  | 'cancelled';

export type ClientPortalDashboardSummary = {
  greetingName: string;
  customerNameMasked: string;
  companyName: string;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  quadraLote: string | null;
  saleStatusLabel: string | null;
  contractStatusLabel: string | null;
  financialStatusLabel: string;
  nextDueDate: string | null;
  paidCount: number;
  openCount: number;
  overdueCount: number;
  negotiationCount: number;
};

export type ClientPortalDashboardContract = {
  contractNumber: string | null;
  statusLabel: string | null;
  signatureStatusLabel: string | null;
  generatedAt: string | null;
  signUrl: string | null;
  contractViewUrl: string | null;
  contractDownloadUrl: string | null;
  contractDownloadAvailable: boolean;
  contractDownloadUnavailableMessage: string | null;
  emptyMessage: string | null;
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
    | 'financialStatusLabel'
    | 'nextDueDate'
    | 'paidCount'
    | 'openCount'
    | 'overdueCount'
    | 'negotiationCount'
  >;
  installments: ClientPortalDashboardInstallment[];
  emptyMessage: string | null;
};

export type ClientPortalDashboardCharge = {
  installmentNumber: number | null;
  dueDate: string | null;
  amountLabel: string | null;
  statusLabel: string;
  paymentUrl: string | null;
  boletoDownloadUrl: string | null;
  pixCopyPaste: string | null;
};

export type ClientPortalDashboardCharges = {
  items: ClientPortalDashboardCharge[];
  emptyMessage: string | null;
};

export type ClientPortalDashboardResponse = {
  ok: true;
  linkType: ClientPortalLinkType;
  summary: ClientPortalDashboardSummary;
  contract: ClientPortalDashboardContract;
  finance: ClientPortalDashboardFinance;
  charges: ClientPortalDashboardCharges;
  companyWhatsAppUrl: string | null;
  message: string | null;
};

export type ClientPortalDashboardErrorResponse = {
  ok: false;
  code: 'UNAUTHORIZED' | 'EXPIRED' | 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' | 'DISABLED' | 'SERVER_ERROR';
  message: string;
  step?: string;
  table?: string;
  filter?: string;
  reason?: string;
};

export type ClientPortalDashboardLoadResult =
  | { ok: true; dashboard: ClientPortalDashboardResponse; httpStatus: 200 }
  | {
      ok: false;
      code: ClientPortalDashboardErrorResponse['code'];
      message: string;
      httpStatus: number;
      step: string;
      table?: string;
      filter?: string;
      reason?: string;
    };
