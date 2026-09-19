/**
 * Textos da Central de Cobranças SV Lotes (WhatsApp/e-mail).
 * Compartilhado pela cobrança em massa e pelos lembretes automáticos ao comprador.
 */

import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  resolveChargeWhatsAppBoletoOrInvoiceUrl,
  resolveChargeWhatsAppPrimaryPaymentUrl,
} from '@/lib/charges/chargeWhatsAppMessage';

export const BUYER_COLLECTION_FOOTER = 'SV Lotes — Central de Cobranças';

const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di']);

/** Formatação só para mensagem. Não altera cadastro. Só age em texto majoritariamente maiúsculo. */
export function formatBuyerDisplayName(value?: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters) return trimmed;
  const upperCount = [...letters].filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
  if (upperCount / letters.length < 0.75) return trimmed;
  const titled = toContractTitleCase(trimmed);
  return titled
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && NAME_PARTICLES.has(lower)) return lower;
      return word;
    })
    .join(' ');
}

/** "Parcela 1 / 1" → "1/1". Entrada permanece Entrada. */
export function formatBuyerParcelNumberLabel(parcelLabel?: string | null): string {
  const raw = String(parcelLabel || '').trim();
  if (!raw) return '—';
  if (/^entrada$/i.test(raw)) return 'Entrada';
  return raw.replace(/^parcela\s+/i, '').replace(/\s+/g, '') || raw;
}

export type BuyerMessageParcel = {
  parcelLabel: string;
  dueDateLabel: string;
  amount: number;
  projectName?: string | null;
  blockName?: string | null;
  lotNumber?: string | null;
  lotLabel?: string | null;
  charge?: CompanyAsaasChargeResponse | null;
};

export function firstNameFromFullName(name?: string | null): string {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return 'Cliente';
  return formatBuyerDisplayName(trimmed.split(/\s+/)[0] || '') || 'Cliente';
}

export function parseQuadraLote(lotLabel?: string | null): { quadra: string; lote: string } {
  const raw = String(lotLabel || '').trim();
  const match = raw.match(/QD\s+(.+?)\s+[•·\-]\s+LT\s+(.+)/i);
  if (match) {
    return { quadra: match[1].trim() || '—', lote: match[2].trim() || '—' };
  }
  return { quadra: raw || '—', lote: '—' };
}

export function resolveQuadraLote(parcel: BuyerMessageParcel): { quadra: string; lote: string } {
  const quadra = String(parcel.blockName || '').trim();
  const lote = String(parcel.lotNumber || '').trim();
  if (quadra || lote) {
    return { quadra: quadra || '—', lote: lote || '—' };
  }
  return parseQuadraLote(parcel.lotLabel);
}

export function formatBuyerPaymentBlock(charge?: CompanyAsaasChargeResponse | null): string[] {
  if (!charge) return [];
  const lines: string[] = [];
  const boleto = resolveChargeWhatsAppBoletoOrInvoiceUrl(charge);
  const primary = resolveChargeWhatsAppPrimaryPaymentUrl(charge);
  const pix = String(charge.pixCopyPaste || '').trim();
  const linha = String(charge.bankSlipIdentification || '').trim();

  if (primary) {
    lines.push(boleto ? '*Boleto/Fatura:*' : '*Link para pagamento:*', primary, '');
  }
  if (pix) {
    lines.push('*PIX:*', pix, '');
  }
  if (linha) {
    lines.push('*Linha digitável:*', linha, '');
  }
  return lines;
}

export function formatBuyerPaymentBlockPlain(charge?: CompanyAsaasChargeResponse | null): string[] {
  return formatBuyerPaymentBlock(charge).map((line) => line.replace(/^\*|\*$/g, ''));
}

function formatParcelIdentity(parcel: BuyerMessageParcel): string[] {
  const { quadra, lote } = resolveQuadraLote(parcel);
  const valor = formatCurrencyBRL(parcel.amount) || 'R$ 0,00';
  return [
    `*Quadra:* ${quadra}`,
    `*Lote:* ${lote}`,
    `*Parcela:* ${formatBuyerParcelNumberLabel(parcel.parcelLabel)}`,
    `*Vencimento:* ${parcel.dueDateLabel}`,
    `*Valor original:* ${valor}`,
  ];
}

function appendPortalLines(lines: string[], portalUrl?: string | null): void {
  const url = String(portalUrl || '').trim();
  if (!url) return;
  lines.push(
    '📱 *Portal do Cliente SV Lotes*',
    '',
    'Consulte suas parcelas, pagamentos e informações do contrato:',
    url,
    '',
  );
}

export function buildBuyerMassCollectionMessage(input: {
  customerName: string;
  loteadoraName: string;
  parcels: BuyerMessageParcel[];
  portalUrl?: string | null;
}): string {
  const firstName = firstNameFromFullName(input.customerName);
  const empresa =
    formatBuyerDisplayName(input.loteadoraName) ||
    String(input.loteadoraName || '').trim() ||
    'a empresa responsável pelo empreendimento';
  const parcels = [...input.parcels];
  const projects = [
    ...new Set(
      parcels
        .map((p) => formatBuyerDisplayName(p.projectName) || String(p.projectName || '').trim())
        .filter((name) => name && name !== '—'),
    ),
  ];
  const projectLabel = projects.length ? projects.join(', ') : 'seu empreendimento';
  const total = parcels.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalLabel = formatCurrencyBRL(total) || 'R$ 0,00';
  const plural = parcels.length > 1;

  const lines: string[] = [
    `Olá, ${firstName}!`,
    '',
    `Este é um aviso automático do *SV Lotes*, referente ao empreendimento *${projectLabel}*, administrado por *${empresa}*.`,
    '',
    plural
      ? 'Identificamos as seguintes parcelas em aberto:'
      : 'Identificamos a seguinte parcela em aberto:',
    '',
  ];

  parcels.forEach((parcel, index) => {
    lines.push(...formatParcelIdentity(parcel), '');
    const payment = formatBuyerPaymentBlock(parcel.charge);
    if (payment.length) lines.push(...payment);
    if (index < parcels.length - 1) lines.push('---', '');
  });

  lines.push(`*Total:* ${totalLabel}`, '');
  lines.push(
    'Multa e juros, quando aplicáveis, serão calculados conforme as condições da cobrança.',
    '',
    '*Já realizou o pagamento?*',
    'Nesse caso, por favor, desconsidere esta mensagem. A baixa poderá ocorrer após a compensação bancária.',
    '',
  );
  appendPortalLines(lines, input.portalUrl);
  lines.push(`Em caso de dúvidas, entre em contato com *${empresa}*.`, '', BUYER_COLLECTION_FOOTER);
  return lines.join('\n');
}

export type BuyerReminderMessageKind = 'due_soon' | 'due_today' | 'overdue_friendly';

export function buildBuyerReminderWhatsAppMessage(input: {
  kind: BuyerReminderMessageKind;
  customerName: string;
  loteadoraName: string;
  projectName: string;
  parcel: BuyerMessageParcel;
  portalUrl?: string | null;
}): string {
  const firstName = firstNameFromFullName(input.customerName);
  const empresa =
    formatBuyerDisplayName(input.loteadoraName) ||
    String(input.loteadoraName || '').trim() ||
    'a empresa responsável pelo empreendimento';
  const emp =
    formatBuyerDisplayName(input.projectName) ||
    String(input.projectName || '').trim() ||
    'seu empreendimento';
  const valor = formatCurrencyBRL(input.parcel.amount) || 'R$ 0,00';
  const { quadra, lote } = resolveQuadraLote(input.parcel);
  const parcela = formatBuyerParcelNumberLabel(input.parcel.parcelLabel);
  const payment = formatBuyerPaymentBlock(input.parcel.charge);
  const lines: string[] = [];

  if (input.kind === 'due_soon') {
    lines.push(`Olá, ${firstName}! Tudo bem?`, '');
    lines.push(
      `Este é um lembrete automático do *SV Lotes*, referente ao empreendimento *${emp}*, administrado por *${empresa}*.`,
      '',
      `Sua próxima parcela vence em *${input.parcel.dueDateLabel}*.`,
      '',
      `*Quadra:* ${quadra}`,
      `*Lote:* ${lote}`,
      `*Parcela:* ${parcela}`,
      `*Valor:* ${valor}`,
      '',
    );
  } else if (input.kind === 'due_today') {
    lines.push(`Olá, ${firstName}!`, '');
    lines.push(
      `Este é um lembrete automático do *SV Lotes* referente ao empreendimento *${emp}*, administrado por *${empresa}*.`,
      '',
      'Sua parcela vence *hoje*.',
      '',
      `*Quadra:* ${quadra}`,
      `*Lote:* ${lote}`,
      `*Parcela:* ${parcela}`,
      `*Vencimento:* ${input.parcel.dueDateLabel}`,
      `*Valor:* ${valor}`,
      '',
    );
  } else {
    lines.push(`Olá, ${firstName}!`, '');
    lines.push(
      `Este é um aviso automático do *SV Lotes*, referente ao empreendimento *${emp}*, administrado por *${empresa}*.`,
      '',
      'Identificamos uma parcela que permanece em aberto:',
      '',
      `*Quadra:* ${quadra}`,
      `*Lote:* ${lote}`,
      `*Parcela:* ${parcela}`,
      `*Vencimento:* ${input.parcel.dueDateLabel}`,
      `*Valor original:* ${valor}`,
      '',
    );
  }

  if (payment.length) {
    lines.push('💳 *Dados para pagamento*', '', ...payment);
  }

  if (input.kind === 'overdue_friendly') {
    lines.push(
      'Multa e juros, quando aplicáveis, serão apresentados no meio de pagamento correspondente.',
      '',
    );
  }

  const portalUrl = String(input.portalUrl || '').trim();
  if (portalUrl) {
    const portalIntro =
      input.kind === 'due_today'
        ? 'Acompanhe suas parcelas, pagamentos e informações do contrato:'
        : input.kind === 'overdue_friendly'
          ? 'Consulte suas parcelas e pagamentos:'
          : 'Você também pode consultar suas parcelas, pagamentos e informações do contrato pelo Portal do Cliente:';
    lines.push('📱 *Portal do Cliente SV Lotes*', '', portalIntro, portalUrl, '');
  }

  if (input.kind === 'due_soon') {
    lines.push(
      '*Já realizou o pagamento antecipadamente?*',
      'Nesse caso, desconsidere este lembrete. A atualização poderá ocorrer após a compensação bancária.',
      '',
    );
  } else if (input.kind === 'due_today') {
    lines.push(
      '*Pagamento já realizado?*',
      'Por favor, desconsidere esta mensagem. A baixa poderá ocorrer após a compensação bancária.',
      '',
    );
  } else {
    lines.push(
      '*Já efetuou o pagamento?*',
      'Se o pagamento já foi realizado, desconsidere esta mensagem. A baixa poderá ocorrer após a compensação bancária.',
      '',
    );
  }

  lines.push(
    input.kind === 'overdue_friendly'
      ? `Se precisar de esclarecimentos, entre em contato com *${empresa}*.`
      : `Em caso de dúvidas, entre em contato com *${empresa}*.`,
    '',
    BUYER_COLLECTION_FOOTER,
  );
  return lines.join('\n');
}

export function buyerReminderEmailSubject(
  kind: BuyerReminderMessageKind,
  projectName: string,
): string {
  const emp =
    formatBuyerDisplayName(projectName) || String(projectName || '').trim() || 'seu empreendimento';
  if (kind === 'due_soon') return `Lembrete de vencimento — ${emp}`;
  if (kind === 'due_today') return `Sua parcela vence hoje — ${emp}`;
  return `Aviso de parcela em aberto — ${emp}`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlParagraphsFromWhatsApp(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line).replace(/\*(.*?)\*/g, '<strong>$1</strong>');
      if (!escaped.trim()) return '<br />';
      return `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.45;color:#1f2937;">${escaped}</p>`;
    })
    .join('\n');
}

export function buildBuyerReminderEmailHtml(
  whatsappBody: string,
  extras?: { companyName?: string | null; includeReplyHint?: boolean },
): string {
  const company = escapeHtml(
    formatBuyerDisplayName(extras?.companyName) || String(extras?.companyName || '').trim(),
  );
  const footer = company
    ? `<p style="margin:16px 0 8px 0;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#4b5563;">Esta mensagem foi enviada automaticamente pelo SV Lotes em nome de <strong>${company}</strong>.</p>${
        extras?.includeReplyHint
          ? '<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#4b5563;">Para falar com a empresa responsável, responda este e-mail.</p>'
          : ''
      }`
    : '';
  return `<div>${htmlParagraphsFromWhatsApp(whatsappBody)}${footer}</div>`;
}

export function buildBuyerReminderEmailText(
  whatsappBody: string,
  extras?: { companyName?: string | null; includeReplyHint?: boolean },
): string {
  const body = whatsappBody.replace(/\*/g, '');
  const company =
    formatBuyerDisplayName(extras?.companyName) || String(extras?.companyName || '').trim();
  if (!company) return body;
  const lines = [
    body,
    '',
    `Esta mensagem foi enviada automaticamente pelo SV Lotes em nome de ${company}.`,
  ];
  if (extras?.includeReplyHint) {
    lines.push('Para falar com a empresa responsável, responda este e-mail.');
  }
  return lines.join('\n');
}
