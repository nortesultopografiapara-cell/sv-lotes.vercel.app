/**
 * Tipos dos participantes da assinatura eletrônica de venda.
 */

export const SALE_SIGNATURE_PARTY_ROLES = ['BUYER', 'SPOUSE', 'VENDOR'] as const;

export type SaleSignaturePartyRole = (typeof SALE_SIGNATURE_PARTY_ROLES)[number];

export const SALE_SIGNATURE_PARTY_STATUSES = [
  'PENDING',
  'VIEWED',
  'SIGNED',
  'CANCELLED',
  'EXPIRED',
  'ERROR',
] as const;

export type SaleSignaturePartyStatus =
  (typeof SALE_SIGNATURE_PARTY_STATUSES)[number];

export type ContractSignaturePartyRow = {
  id: string;
  company_id: string;
  contract_signature_id: string;
  contract_id: string;
  sale_id: string | null;
  role: SaleSignaturePartyRole;
  signer_name: string | null;
  signer_cpf: string | null;
  signer_phone: string | null;
  signer_email: string | null;
  signature_token_hash: string | null;
  signature_url: string | null;
  status: SaleSignaturePartyStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  signature_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  signature_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type SaleSignaturePartyPublicView = {
  id: string;
  role: SaleSignaturePartyRole;
  roleLabel: string;
  signer_name: string | null;
  /** Alias camelCase para a modal / API de compartilhamento. */
  name?: string | null;
  signer_cpf_masked?: string | null;
  signer_phone: string | null;
  phone?: string | null;
  signer_email: string | null;
  email?: string | null;
  status: SaleSignaturePartyStatus;
  statusLabel: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  /** URL pública — só retornada na API autenticada, nunca no log. */
  signature_url?: string | null;
  /** Alias camelCase (mesmo valor de signature_url quando includeUrls). */
  signatureUrl?: string | null;
  canResend: boolean;
  canShare: boolean;
  /** Preview: SPOUSE/BUYER pendente sem URL — modal deve exibir erro, não omitir. */
  missingPublicUrl?: boolean;
};

export function saleSignaturePartyRoleLabel(
  role?: string | null,
): string {
  const key = String(role || '').toUpperCase();
  if (key === 'BUYER') return 'Comprador';
  if (key === 'SPOUSE') return 'Cônjuge anuente';
  if (key === 'VENDOR') return 'Vendedora';
  return 'Signatário';
}

export function saleSignaturePartyStatusLabel(
  status?: string | null,
): string {
  const key = String(status || '').toUpperCase();
  switch (key) {
    case 'PENDING':
      return 'Aguardando assinatura';
    case 'VIEWED':
      return 'Visualizado';
    case 'SIGNED':
      return 'Assinado';
    case 'CANCELLED':
      return 'Cancelado';
    case 'EXPIRED':
      return 'Expirado';
    case 'ERROR':
      return 'Erro no envio';
    default:
      return 'Pendente';
  }
}

export function isPublicPartyRole(role?: string | null): boolean {
  const key = String(role || '').toUpperCase();
  return key === 'BUYER' || key === 'SPOUSE';
}
