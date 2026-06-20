/**
 * Envio de e-mails de lembrete de cobrança SaaS via Resend.
 */

import { Resend } from 'resend';
import {
  buildSaasBillingReminderLateFeeLines,
  formatReminderAmountBr,
  formatReminderDueDateBr,
  getSaasBillingReminderDefinition,
  type SaasBillingReminderType,
} from '@/lib/saasBillingReminderTypes';
import { DEFAULT_FINE_PERCENT, DEFAULT_INTEREST_PERCENT } from '@/lib/saasLateFeeConfig';

export type SaasBillingReminderEmailInput = {
  to: string;
  companyName: string;
  amount: number;
  dueDate: string;
  referenceMonth: string;
  paymentUrl: string | null;
  reminderType: SaasBillingReminderType;
};

export type SaasBillingReminderEmailResult = {
  ok: boolean;
  providerId?: string | null;
  error?: string;
};

function resolveResendFromAddress(): string {
  return (
    String(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim() ||
    'SV LOTES <noreply@svlotes.com.br>'
  );
}

export function isSaasBillingEmailConfigured(): boolean {
  return !!String(process.env.RESEND_API_KEY || '').trim();
}

export function buildSaasBillingReminderEmailHtml(
  input: SaasBillingReminderEmailInput,
): { subject: string; html: string; text: string } {
  const definition = getSaasBillingReminderDefinition(input.reminderType);
  const dueLabel = formatReminderDueDateBr(input.dueDate);
  const amountLabel = formatReminderAmountBr(input.amount);
  const lateFeeLines = buildSaasBillingReminderLateFeeLines();
  const paymentLink = String(input.paymentUrl || '').trim();

  const textLines = [
    definition.intro,
    '',
    `Empresa: ${input.companyName}`,
    `Competência: ${input.referenceMonth}`,
    `Valor: ${amountLabel}`,
    `Vencimento: ${dueLabel}`,
    ...lateFeeLines.map((line) => line),
    paymentLink ? '' : null,
    paymentLink ? `Link de pagamento: ${paymentLink}` : null,
    '',
    'SV LOTES',
    'Gestão Imobiliária e GIS',
  ].filter(Boolean) as string[];

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;background:#f8fafc;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <p style="margin:0 0 16px;font-size:16px;">${definition.intro}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Empresa</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(input.companyName)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Competência</td><td style="padding:6px 0;">${escapeHtml(input.referenceMonth)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Valor</td><td style="padding:6px 0;font-weight:600;color:#047857;">${escapeHtml(amountLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Vencimento</td><td style="padding:6px 0;">${escapeHtml(dueLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Multa</td><td style="padding:6px 0;">${escapeHtml(String(DEFAULT_FINE_PERCENT))}%</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Juros</td><td style="padding:6px 0;">${escapeHtml(String(DEFAULT_INTEREST_PERCENT))}% ao dia</td></tr>
      </table>
      ${
        paymentLink
          ? `<p style="margin:20px 0;"><a href="${escapeHtmlAttr(paymentLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Pagar assinatura</a></p>
             <p style="font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(paymentLink)}</p>`
          : '<p style="font-size:14px;color:#6b7280;">Entre em contato com o suporte SV LOTES para obter o link de pagamento.</p>'
      }
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;font-size:13px;color:#374151;font-weight:700;">SV LOTES</p>
      <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Gestão Imobiliária e GIS</p>
    </div>
  </body>
</html>`;

  return {
    subject: definition.subject,
    html,
    text: textLines.join('\n'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export async function sendSaasBillingReminderEmail(
  input: SaasBillingReminderEmailInput,
): Promise<SaasBillingReminderEmailResult> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }

  const to = String(input.to || '').trim();
  if (!to.includes('@')) {
    return { ok: false, error: 'E-mail destino inválido.' };
  }

  const { subject, html, text } = buildSaasBillingReminderEmailHtml(input);

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: resolveResendFromAddress(),
      to,
      subject,
      html,
      text,
    });

    if (response.error) {
      return { ok: false, error: response.error.message || 'Falha ao enviar e-mail.' };
    }

    return { ok: true, providerId: response.data?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao enviar e-mail.',
    };
  }
}
