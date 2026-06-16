/**
 * Status de assinatura eletrônica — contratos de compra e venda.
 */

export type SaleSignatureStatus =
  | 'PENDING'
  | 'VIEWED'
  | 'SIGNED'
  | 'EXPIRED'
  | 'CANCELLED';

const LABELS: Record<SaleSignatureStatus, string> = {
  PENDING: 'Enviado',
  VIEWED: 'Visualizado',
  SIGNED: 'Assinado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const EMOJI: Record<SaleSignatureStatus, string> = {
  PENDING: '📤',
  VIEWED: '👁️',
  SIGNED: '✅',
  EXPIRED: '⏰',
  CANCELLED: '❌',
};

export function saleSignatureStatusLabel(
  status?: string | null,
): string {
  const key = String(status || '').toUpperCase() as SaleSignatureStatus;
  return LABELS[key] || 'Gerado';
}

export function saleSignatureStatusEmoji(status?: string | null): string {
  const key = String(status || '').toUpperCase() as SaleSignatureStatus;
  return EMOJI[key] || '📄';
}

export function canPublicSaleSign(status?: string | null): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED';
}

export function isSaleSignatureBlocked(status?: string | null): boolean {
  const key = String(status || '').toUpperCase();
  return ['SIGNED', 'EXPIRED', 'CANCELLED'].includes(key);
}

export function canSendSaleSignature(
  contractStatus?: string | null,
  signatureStatus?: string | null,
): boolean {
  const st = String(contractStatus || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled', 'superseded'].includes(st)) {
    return false;
  }
  if (['assinado', 'signed'].includes(st)) return false;
  if (signatureStatus) {
    const sig = String(signatureStatus).toUpperCase();
    if (['PENDING', 'VIEWED'].includes(sig)) return false;
    if (sig === 'SIGNED') return false;
  }
  return true;
}

export function canResendSaleSignature(
  signatureStatus?: string | null,
): boolean {
  const key = String(signatureStatus || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED';
}
