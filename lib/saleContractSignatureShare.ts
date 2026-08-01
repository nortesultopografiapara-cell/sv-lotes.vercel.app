/**
 * Compartilhamento do link de assinatura — contratos de compra e venda.
 *
 * WhatsApp/e-mail ao cliente: sempre domínio oficial www.svlotes.com.br
 * (nunca Preview/Vercel), preservando o token da URL informada.
 */

import type { SignatureHistoryEvent } from '@/lib/saleContractSignatureService';
import {
  buildSignatureShareMailtoUrl,
  buildSignatureShareWhatsAppUrl,
  canShareViaEmail,
  canShareViaWhatsApp,
  formatSignatureExpiresAtBr,
  formatSignatureTimelineDateTime,
  type LocalSignatureTimelineEvent,
} from '@/lib/saasContractSignatureShare';
import { extractSaleSignTokenFromUrl } from '@/lib/saleContractUrls';

/** Domínio oficial para links enviados ao comprador/cônjuge (WhatsApp/e-mail). */
export const OFFICIAL_SALE_SIGN_PUBLIC_BASE = 'https://www.svlotes.com.br';

/**
 * Reescreve URL de assinatura para o domínio oficial, sem alterar o token.
 * Se não houver token extraível, devolve a URL original.
 */
export function toOfficialSaleSignShareUrl(signatureUrl: string): string {
  const raw = String(signatureUrl || '').trim();
  if (!raw) return '';
  const token = extractSaleSignTokenFromUrl(raw);
  if (!token) return raw;
  return `${OFFICIAL_SALE_SIGN_PUBLIC_BASE}/sign/sale/${encodeURIComponent(token)}`;
}

function shareField(value: string | null | undefined, fallback: string): string {
  const s = String(value || '').trim();
  return s || fallback;
}

export type SaleSignatureShareInput = {
  buyerName: string;
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  signatureUrl: string;
};

export function buildSaleSignatureShareMessage(input: SaleSignatureShareInput): string {
  return buildSalePartySignatureShareMessage({
    signerName: input.buyerName,
    role: 'BUYER',
    projectName: input.projectName,
    quadra: input.quadra,
    lote: input.lote,
    contractNumber: input.contractNumber,
    signatureUrl: input.signatureUrl,
  });
}

export type SalePartySignatureShareInput = {
  signerName: string;
  role: 'BUYER' | 'SPOUSE';
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  signatureUrl: string;
};

/**
 * Mensagem individual por participante (comprador ou cônjuge).
 * Inclui empreendimento, quadra, lote e contrato — não omitir esses campos.
 */
export function buildSalePartySignatureShareMessage(
  input: SalePartySignatureShareInput,
): string {
  const name = shareField(input.signerName, input.role === 'SPOUSE' ? 'cônjuge' : 'comprador');
  const project = shareField(input.projectName, '—');
  const quadra = shareField(input.quadra, '—');
  const lote = shareField(input.lote, '—');
  const contractNumber = shareField(input.contractNumber, '—');
  const signatureUrl = toOfficialSaleSignShareUrl(input.signatureUrl);

  const purpose =
    input.role === 'SPOUSE'
      ? 'Segue seu link individual para assinatura eletrônica do contrato de compra e venda, na condição de cônjuge anuente.'
      : 'Segue seu link individual para assinatura eletrônica do contrato de compra e venda.';

  return [
    'SV LOTES',
    '',
    `Olá, ${name}.`,
    '',
    purpose,
    '',
    `Empreendimento: ${project}`,
    `Quadra: ${quadra}`,
    `Lote: ${lote}`,
    `Contrato: ${contractNumber}`,
    '',
    'Este link é pessoal e deve ser utilizado somente por você.',
    '',
    'Acesse pelo celular:',
    '',
    signatureUrl,
  ].join('\n');
}

export function buildSaleSignatureEmailSubject(projectName: string): string {
  return `Assinatura eletrônica — Contrato de compra e venda (${projectName})`;
}

export {
  buildSignatureShareWhatsAppUrl,
  buildSignatureShareMailtoUrl,
  canShareViaWhatsApp,
  canShareViaEmail,
  formatSignatureExpiresAtBr,
  formatSignatureTimelineDateTime,
};

export type { LocalSignatureTimelineEvent };

export function mergeSaleSignatureTimeline(
  serverEvents: SignatureHistoryEvent[],
  localEvents: LocalSignatureTimelineEvent[] = [],
): Array<{ at: string; event: string; details: string }> {
  const mappedServer = serverEvents.map((evt) => ({
    at: evt.at,
    event: evt.event,
    details:
      evt.details ||
      (evt.ip ? `IP ${evt.ip}` : evt.user && evt.user !== 'Sistema' ? evt.user : '—'),
  }));

  const mappedLocal = localEvents.map((evt) => ({
    at: evt.at,
    event: evt.event,
    details: evt.details,
  }));

  return [...mappedServer, ...mappedLocal].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}
