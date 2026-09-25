/**
 * Compartilhamento do link de assinatura — contratos de compra e venda.
 *
 * WhatsApp/e-mail/QR/Copiar usam a MESMA URL vigente da party (host do ambiente
 * + token individual). Não reescrever domínio nem regenerar token ao montar a mensagem.
 */

import type { SignatureHistoryEvent } from '@/lib/saleContractSignatureService';
import {
  buildSignatureShareMailtoUrl,
  buildSignatureShareWhatsAppUrl,
  canShareViaEmail,
  canShareViaWhatsApp,
  formatSignatureExpiresAtBr,
  formatSignatureTimelineDateTime,
  qrCodePayloadForSignatureUrl,
  type LocalSignatureTimelineEvent,
} from '@/lib/saasContractSignatureShare';
import { extractSaleSignTokenFromUrl } from '@/lib/saleContractUrls';

/** Domínio oficial de Production — NÃO usar para reescrever mensagem WhatsApp. */
export const OFFICIAL_SALE_SIGN_PUBLIC_BASE = 'https://www.svlotes.com.br';

/**
 * Reescreve URL para o domínio oficial. Mantida só para compatibilidade;
 * o envio WhatsApp/e-mail deve usar a URL do painel sem esta conversão.
 */
export function toOfficialSaleSignShareUrl(signatureUrl: string): string {
  const raw = String(signatureUrl || '').trim();
  if (!raw) return '';
  const token = extractSaleSignTokenFromUrl(raw);
  if (!token) return raw;
  return `${OFFICIAL_SALE_SIGN_PUBLIC_BASE}/sign/sale/${encodeURIComponent(token)}`;
}

/** Extrai a URL `/sign/sale/{token}` da mensagem (última ocorrência). */
export function extractSaleSignUrlFromShareMessage(
  message: string,
): string | null {
  const lines = String(message || '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim().replace(/[.,;]+$/, '');
    if (/^https?:\/\/\S+\/sign\/sale\/\S+/i.test(line)) {
      return line;
    }
  }
  const match = String(message || '').match(
    /https?:\/\/[^\s]+\/sign\/sale\/[^\s]+/i,
  );
  return match ? match[0].replace(/[.,;]+$/, '') : null;
}

/**
 * Canais do mesmo token vigente: painel, copiar, QR e mensagem WhatsApp
 * devem ser idênticos (sem troca de host/token).
 */
export function collectPartySignatureShareChannelUrls(signatureUrl: string): {
  panelLink: string;
  copiedLink: string;
  qrLink: string;
  whatsappMessageLink: string;
} {
  const panelLink = String(signatureUrl || '').trim();
  const copiedLink = panelLink;
  const qrLink = qrCodePayloadForSignatureUrl(panelLink);
  const message = buildSalePartySignatureShareMessage({
    signerName: 'signatário',
    role: 'BUYER',
    projectName: 'empreendimento',
    quadra: '—',
    lote: '—',
    contractNumber: '—',
    signatureUrl: panelLink,
  });
  return {
    panelLink,
    copiedLink,
    qrLink,
    whatsappMessageLink: extractSaleSignUrlFromShareMessage(message) || '',
  };
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
  role: 'BUYER' | 'SPOUSE' | 'VENDOR' | 'WITNESS_1' | 'WITNESS_2';
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  signatureUrl: string;
  instrument?: 'sale-contract' | 'termination';
};

/**
 * Mensagem individual por participante (comprador, cônjuge, vendedor PF ou testemunha).
 * Inclui empreendimento, quadra, lote e contrato — não omitir esses campos.
 */
export function buildSalePartySignatureShareMessage(
  input: SalePartySignatureShareInput,
): string {
  const name = shareField(
    input.signerName,
    input.role === 'SPOUSE'
      ? 'cônjuge'
      : input.role === 'VENDOR'
        ? 'vendedor'
        : input.role === 'WITNESS_1' || input.role === 'WITNESS_2'
          ? 'testemunha'
          : 'comprador',
  );
  const project = shareField(input.projectName, '—');
  const quadra = shareField(input.quadra, '—');
  const lote = shareField(input.lote, '—');
  const contractNumber = shareField(input.contractNumber, '—');
  const signatureUrl = String(input.signatureUrl || '').trim();

  const instrument = input.instrument || 'sale-contract';
  const term =
    instrument === 'termination'
      ? 'Termo de Desistência, Rescisão Contratual e Acerto Financeiro'
      : 'contrato de compra e venda';

  const purpose =
    input.role === 'SPOUSE'
      ? `Segue seu link individual para assinatura eletrônica do ${term}, na condição de cônjuge anuente.`
      : input.role === 'VENDOR'
        ? instrument === 'termination'
          ? `Segue seu link individual para assinatura eletrônica do ${term}, na condição de representante autorizado da vendedora.`
          : `Segue seu link individual para assinatura eletrônica do ${term}, na condição de promitente vendedor.`
        : input.role === 'WITNESS_1' || input.role === 'WITNESS_2'
          ? `Segue seu link individual para assinatura eletrônica do ${term}, na condição de testemunha. Ao abrir o link, informe seus dados e assine.`
          : instrument === 'termination'
            ? `Segue seu link individual para assinatura eletrônica do ${term}, na condição de comprador/desistente.`
            : `Segue seu link individual para assinatura eletrônica do ${term}.`;

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

export function buildSaleSignatureEmailSubject(
  projectName: string,
  instrument: 'sale-contract' | 'termination' = 'sale-contract',
): string {
  if (instrument === 'termination') {
    return `Assinatura eletrônica — Termo de Desistência, Rescisão Contratual e Acerto Financeiro (${projectName})`;
  }
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
