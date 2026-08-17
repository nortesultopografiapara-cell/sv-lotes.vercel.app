/**
 * Regras de assinatura bilateral — cliente primeiro, SV depois.
 */

import type { SignatureStatus } from '@/lib/saasContractStatus';

export function isClientSignatureComplete(status?: SignatureStatus | string | null): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'CLIENT_SIGNED' || key === 'SIGNED';
}

export function isFullySignedContract(status?: SignatureStatus | string | null): boolean {
  return String(status || '').toUpperCase() === 'SIGNED';
}

export function canProviderSignContract(status?: SignatureStatus | string | null): boolean {
  return String(status || '').toUpperCase() === 'CLIENT_SIGNED';
}

export function isPublicClientSignBlocked(status?: SignatureStatus | string | null): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'CLIENT_SIGNED' || key === 'SIGNED' || key === 'EXPIRED' || key === 'CANCELLED';
}

export function canPublicClientSign(status?: SignatureStatus | string | null): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED';
}

/** Botão "Assinar pela SV" — somente painel Master após assinatura do cliente. */
export function canShowProviderSignButton(status?: SignatureStatus | string | null): boolean {
  return canProviderSignContract(status);
}

/**
 * Renderização no Master: depende só do status da assinatura SaaS e do usuário autenticado.
 * Não pode ser gated por hasSaasContractReady / PDF da subscription.
 */
export function shouldRenderMasterProviderSignButton(
  signatureStatus?: SignatureStatus | string | null,
  masterUserId?: string | null,
): boolean {
  return Boolean(masterUserId) && canShowProviderSignButton(signatureStatus);
}

export function isContractSignatureSendBlocked(status?: SignatureStatus | string | null): boolean {
  return isClientSignatureComplete(status);
}

export function canResendOrShareSignature(status?: SignatureStatus | string | null): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED';
}
