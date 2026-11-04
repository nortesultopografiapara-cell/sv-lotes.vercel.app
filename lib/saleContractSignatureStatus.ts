/**
 * Status de assinatura eletrônica — contratos de compra e venda.
 */

export type SaleSignatureStatus =
  | 'PENDING'
  | 'VIEWED'
  | 'PARTIALLY_SIGNED'
  | 'CLIENT_SIGNED'
  | 'SIGNED'
  | 'EXPIRED'
  | 'CANCELLED';

const LABELS: Record<SaleSignatureStatus, string> = {
  PENDING: 'Enviado',
  VIEWED: 'Visualizado',
  PARTIALLY_SIGNED: 'Parcialmente assinado',
  CLIENT_SIGNED: 'Aguardando assinatura da vendedora',
  SIGNED: 'Assinado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const EMOJI: Record<SaleSignatureStatus, string> = {
  PENDING: '📤',
  VIEWED: '👁️',
  PARTIALLY_SIGNED: '🟡',
  CLIENT_SIGNED: '🟠',
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

/** Link individual ainda assinável. Prazo vazio não expira a linha. */
export function individualPartyLinkStillOpen(
  party?: { status?: string | null; expires_at?: string | null } | null,
  now = new Date(),
): boolean {
  if (!party) return false;
  const status = String(party.status || '').toUpperCase();
  if (status !== 'PENDING' && status !== 'VIEWED') return false;
  if (!party.expires_at) return true;
  const expiresAt = new Date(party.expires_at).getTime();
  return !Number.isNaN(expiresAt) && expiresAt >= now.getTime();
}

/**
 * SIGNED e CANCELLED bloqueiam qualquer token.
 * EXPIRED do processo não bloqueia um participante cujo próprio link ainda vale.
 */
export function processStatusBlocksIndividualParty(
  processStatus?: string | null,
  party?: { status?: string | null; expires_at?: string | null } | null,
  now = new Date(),
): boolean {
  const process = String(processStatus || '').toUpperCase();
  if (process === 'SIGNED' || process === 'CANCELLED') return true;
  if (process === 'EXPIRED') return !individualPartyLinkStillOpen(party, now);
  return false;
}

export function isSaleSignatureBlocked(status?: string | null): boolean {
  const key = String(status || '').toUpperCase();
  return [
    'PARTIALLY_SIGNED',
    'CLIENT_SIGNED',
    'SIGNED',
    'EXPIRED',
    'CANCELLED',
  ].includes(key);
}

export function canSendSaleSignature(
  contractStatus?: string | null,
  signatureStatus?: string | null,
): boolean {
  const st = String(contractStatus || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled', 'superseded'].includes(st)) {
    return false;
  }
  if (['assinado', 'signed', 'client_signed'].includes(st)) return false;
  if (signatureStatus) {
    const sig = String(signatureStatus).toUpperCase();
    if (
      [
        'PENDING',
        'VIEWED',
        'PARTIALLY_SIGNED',
        'CLIENT_SIGNED',
        'SIGNED',
      ].includes(sig)
    ) {
      return false;
    }
  }
  return true;
}

export function canResendSaleSignature(
  signatureStatus?: string | null,
): boolean {
  const key = String(signatureStatus || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED' || key === 'PARTIALLY_SIGNED';
}
