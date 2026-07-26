/**
 * Envio genérico via Resend (reutiliza a mesma infra do SaaS billing).
 */

import { Resend } from 'resend';

export type ResendAttachment = {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
};

export type ResendSendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
};

export type ResendSendResult = {
  ok: boolean;
  providerId?: string | null;
  error?: string;
};

export function isResendEmailConfigured(): boolean {
  return !!String(process.env.RESEND_API_KEY || '').trim();
}

function resolveFromAddress(): string {
  return (
    String(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim() ||
    'SV LOTES <noreply@svlotes.com.br>'
  );
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'E-mail não configurado (RESEND_API_KEY).' };
  }

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  if (!to.length) return { ok: false, error: 'Destinatário inválido.' };
  if (!String(input.subject || '').trim()) return { ok: false, error: 'Assunto obrigatório.' };

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: resolveFromAddress(),
      to,
      subject: String(input.subject).trim(),
      html: input.html,
      text: input.text || undefined,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
        content_type: a.contentType,
      })),
    });
    if (error) return { ok: false, error: error.message || 'Falha no provedor de e-mail.' };
    return { ok: true, providerId: data?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar e-mail.',
    };
  }
}
