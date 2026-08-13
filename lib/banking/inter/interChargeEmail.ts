import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';

export function buildInterChargeEmailHtml(input: {
  clientName: string;
  projectName: string;
  lotLabel: string;
  parcelLabel: string;
  dueDateLabel: string;
  amount: number;
  pixCopyPaste?: string | null;
  digitableLine?: string | null;
}): { subject: string; html: string; text: string } {
  const clientName = input.clientName.trim() || 'Cliente';
  const valor = formatCurrencyBRL(Number(input.amount) || 0);
  const pix = String(input.pixCopyPaste || '').trim();
  const linha = String(input.digitableLine || '').trim();
  const subject = `Cobrança ${input.parcelLabel} — ${valor}`;

  const blocks: string[] = [
    `<p>Olá, ${escapeHtml(clientName)}.</p>`,
    `<p>Segue sua cobrança referente a <strong>${escapeHtml(input.projectName || 'empreendimento')}</strong> — ${escapeHtml(input.lotLabel || 'lote')}.</p>`,
    `<p>Parcela: <strong>${escapeHtml(input.parcelLabel)}</strong><br/>Vencimento: <strong>${escapeHtml(input.dueDateLabel)}</strong><br/>Valor: <strong>${escapeHtml(valor)}</strong></p>`,
  ];
  if (pix) {
    blocks.push(
      `<p>Pix copia e cola:</p><p style="font-family:monospace;word-break:break-all">${escapeHtml(pix)}</p>`,
    );
  }
  if (linha) {
    blocks.push(
      `<p>Linha digitável:</p><p style="font-family:monospace">${escapeHtml(linha)}</p>`,
    );
  }
  blocks.push('<p>SV LOTES</p>');

  const textParts = [
    `Olá, ${clientName}.`,
    `Segue sua cobrança referente a ${input.projectName || 'empreendimento'} — ${input.lotLabel || 'lote'}.`,
    `Parcela: ${input.parcelLabel}`,
    `Vencimento: ${input.dueDateLabel}`,
    `Valor: ${valor}`,
  ];
  if (pix) textParts.push('', 'Pix copia e cola:', pix);
  if (linha) textParts.push('', 'Linha digitável:', linha);
  textParts.push('', 'SV LOTES');

  return { subject, html: blocks.join('\n'), text: textParts.join('\n') };
}

export function interChargeEmailPayloadFromCharge(
  charge: CompanyAsaasChargeResponse,
  extra: {
    clientName: string;
    projectName: string;
    lotLabel: string;
    parcelLabel: string;
    dueDateLabel: string;
  },
) {
  return buildInterChargeEmailHtml({
    ...extra,
    amount: Number(charge.value) || 0,
    pixCopyPaste: charge.pixCopyPaste,
    digitableLine: charge.bankSlipIdentification,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
