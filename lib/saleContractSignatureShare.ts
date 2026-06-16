/**
 * Compartilhamento do link de assinatura — contratos de compra e venda.
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

export type SaleSignatureShareInput = {
  buyerName: string;
  projectName: string;
  quadra: string;
  lote: string;
  contractNumber: string;
  signatureUrl: string;
};

export function buildSaleSignatureShareMessage(input: SaleSignatureShareInput): string {
  const quadra = input.quadra.trim() || '—';
  const lote = input.lote.trim() || '—';
  const project = input.projectName.trim() || 'empreendimento';
  const buyer = input.buyerName.trim() || 'comprador';

  return [
    `Olá, segue o link para assinatura eletrônica do contrato de compra e venda do lote QD ${quadra} LT ${lote} do empreendimento ${project}.`,
    '',
    'Acesse pelo celular, confira o contrato e assine digitalmente:',
    input.signatureUrl,
    '',
    `Contrato: ${input.contractNumber}`,
    `Comprador: ${buyer}`,
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
