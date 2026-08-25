/**
 * Snapshot documental imutável do termo de encerramento.
 * Valores financeiros vêm do settlement persistido — nunca recalculados aqui.
 */

import type {
  CustomerObligationBreakdown,
  ImprovementsRecord,
} from '@/lib/contract-termination/improvements';

export const TERMINATION_DOCUMENT_OPERATION_TYPES = [
  'desistencia',
  'distrato',
  'inadimplencia',
  'erro_cadastro',
  'cancelamento_administrativo',
] as const;

export type TerminationDocumentOperationType =
  (typeof TERMINATION_DOCUMENT_OPERATION_TYPES)[number];

export type TerminationDocumentStatus =
  | 'PENDING'
  | 'GENERATED'
  | 'SIGNED'
  | 'FAILED';

export type TerminationDocumentSignatureStatus = 'NOT_STARTED';

export type TerminationDocumentParty = {
  role: 'vendedor' | 'comprador' | 'conjuge';
  name: string | null;
  document: string | null;
  extra: string | null;
};

export type TerminationRefundInstallment = {
  number: number;
  dueDate: string;
  amount: number;
};

export type TerminationRefundSchedule =
  | {
      defined: false;
      installmentCount: number | null;
      installments: [];
    }
  | {
      defined: true;
      installmentCount: number;
      firstDueDate: string;
      frequency: 'MONTHLY';
      installments: TerminationRefundInstallment[];
    };

export type TerminationDocumentSnapshot = {
  documentNumber: string;
  title: string;
  operationType: TerminationDocumentOperationType;
  generatedAt: string;
  operatorUserId: string | null;
  settlementId: string;
  saleId: string;
  contractId: string | null;
  blockId: string | null;
  projectId: string | null;
  customerId: string | null;
  companyId: string;
  contractNumber: string | null;
  contractModel: string | null;
  forumCitySnapshot: string | null;
  policyVersion: string | null;
  policySource: string | null;
  clauseReference: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  unitLabel: string | null;
  vendor: TerminationDocumentParty;
  buyer: TerminationDocumentParty;
  spouse: TerminationDocumentParty | null;
  totalPaid: number;
  entryAmount: number;
  signalAmount: number;
  nonRefundableAmount: number;
  restitutionBase: number;
  retentionPercent: number | null;
  retentionAmount: number;
  agreedRefundAmount: number | null;
  refundInstallments: number | null;
  refundDestination: 'REFUND_CUSTOMER' | 'CREDIT_OTHER_UNIT';
  improvementStatus: string | null;
  improvements: ImprovementsRecord;
  obligation: CustomerObligationBreakdown;
  pendingObligationsCanceled: boolean;
  refundSchedule: TerminationRefundSchedule;
  html: string;
  contentHash: string;
  signatureStatus: TerminationDocumentSignatureStatus;
};

export const DESISTENCIA_DOCUMENT_TITLE =
  'TERMO DE DESISTÊNCIA, RESCISÃO CONTRATUAL E ACERTO FINANCEIRO';

export const SALE_DOCUMENT_TYPE_DESISTENCIA = 'DESISTENCIA';
export const SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO = 'DESISTENCIA_ASSINADO';
