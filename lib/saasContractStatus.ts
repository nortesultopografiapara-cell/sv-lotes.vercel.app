/**
 * Status do documento de contrato SaaS (company_contracts).
 * Fase 1: preparação para assinatura eletrônica nas próximas fases.
 */

export const SAAS_CONTRACT_DOCUMENT_STATUSES = [
  'draft',
  'generated',
  'sent',
  'viewed',
  'signed',
  'active',
  'cancelled',
  'superseded',
] as const;

export type SaasContractDocumentStatus = (typeof SAAS_CONTRACT_DOCUMENT_STATUSES)[number];

/** Status em que o PDF já existe e pode ser visualizado/baixado. */
const READY_DOCUMENT_STATUSES = new Set<SaasContractDocumentStatus>([
  'generated',
  'sent',
  'viewed',
  'signed',
  'active',
]);

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  generated: 'Gerado',
  sent: 'Enviado',
  viewed: 'Visualizado',
  signed: 'Assinado',
  active: 'Ativo',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  superseded: 'Substituído',
  pending: 'Pendente',
};

export function normalizeSaasContractDocumentStatus(
  status?: string | null,
): SaasContractDocumentStatus | string {
  const st = String(status ?? '').trim().toLowerCase();
  if (!st) return 'draft';
  if (st === 'canceled') return 'cancelled';
  if (SAAS_CONTRACT_DOCUMENT_STATUSES.includes(st as SaasContractDocumentStatus)) {
    return st as SaasContractDocumentStatus;
  }
  return st;
}

export function isSaasContractDocumentReady(status?: string | null): boolean {
  const normalized = normalizeSaasContractDocumentStatus(status);
  return READY_DOCUMENT_STATUSES.has(normalized as SaasContractDocumentStatus);
}

export function saasContractDocumentStatusLabel(status?: string | null): string {
  const st = normalizeSaasContractDocumentStatus(status);
  return DOCUMENT_STATUS_LABELS[String(st)] || String(st) || '—';
}

/** Versão vigente do documento (não substituída). */
const CURRENT_DOCUMENT_STATUSES = new Set<SaasContractDocumentStatus>([
  'generated',
  'sent',
  'viewed',
  'signed',
  'active',
]);

export function isCurrentSaasContractVersion(status?: string | null): boolean {
  const normalized = normalizeSaasContractDocumentStatus(status);
  return CURRENT_DOCUMENT_STATUSES.has(normalized as SaasContractDocumentStatus);
}

/** Status gravado ao gerar o PDF (antes de assinatura). */
export const SAAS_CONTRACT_STATUS_AFTER_GENERATION: SaasContractDocumentStatus = 'generated';

export const SAAS_CONTRACT_CURRENT_VERSION_STATUSES: SaasContractDocumentStatus[] = [
  'generated',
  'sent',
  'viewed',
  'signed',
  'active',
];

export type SignatureStatus = 'PENDING' | 'VIEWED' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';

const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  PENDING: 'Aguardando assinatura',
  VIEWED: 'Visualizado',
  SIGNED: 'Assinado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

export function signatureStatusLabel(status?: string | null): string {
  const key = String(status || 'PENDING').toUpperCase() as SignatureStatus;
  return SIGNATURE_STATUS_LABELS[key] || status || '—';
}

export function signatureStatusEmoji(status?: string | null): string {
  const key = String(status || 'PENDING').toUpperCase();
  if (key === 'SIGNED') return '🟢';
  if (key === 'VIEWED') return '🔵';
  if (key === 'EXPIRED' || key === 'CANCELLED') return '🔴';
  return '🟡';
}

