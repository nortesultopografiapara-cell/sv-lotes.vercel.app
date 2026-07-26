/**
 * Envio genérico via Resend (reutiliza a mesma infra do SaaS billing).
 * Mensagens amigáveis em PT-BR — sem expor detalhes técnicos do provedor ao usuário.
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

export type ResendErrorCode =
  | 'API_KEY_MISSING'
  | 'FROM_MISSING'
  | 'DOMAIN_UNVERIFIED'
  | 'RECIPIENT_INVALID'
  | 'ATTACHMENT_TOO_LARGE'
  | 'PROVIDER_ERROR';

export type ResendSendResult = {
  ok: boolean;
  providerId?: string | null;
  /** Mensagem amigável em português (segura para UI). */
  error?: string;
  /** Código interno estável (auditoria; sem segredos). */
  errorCode?: ResendErrorCode;
  /** Trecho curto do provedor (só log interno; sem API key). */
  providerMessageSafe?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Limite prudente de anexos totais (~18 MB) para falhar cedo com mensagem clara. */
const MAX_ATTACHMENTS_BYTES = 18 * 1024 * 1024;

export function isResendEmailConfigured(): boolean {
  return !!String(process.env.RESEND_API_KEY || '').trim();
}

export function resolveResendFromAddress(): string | null {
  const from = String(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
  return from || null;
}

export function classifyResendProviderError(raw: string): {
  code: ResendErrorCode;
  userMessage: string;
} {
  const msg = String(raw || '').toLowerCase();

  if (
    msg.includes('only send testing emails') ||
    msg.includes('verify a domain') ||
    msg.includes('domain is not verified') ||
    msg.includes('not verified') ||
    (msg.includes('domain') && msg.includes('verif'))
  ) {
    return {
      code: 'DOMAIN_UNVERIFIED',
      userMessage:
        'O domínio remetente ainda não está verificado no serviço de e-mail. Verifique o domínio no Resend ou envie temporariamente apenas para o endereço autorizado da conta.',
    };
  }

  if (
    msg.includes('too large') ||
    msg.includes('payload too large') ||
    msg.includes('attachment') && msg.includes('size') ||
    msg.includes('413')
  ) {
    return {
      code: 'ATTACHMENT_TOO_LARGE',
      userMessage:
        'Os anexos excederam o tamanho permitido pelo serviço de e-mail. Remova alguns anexos e tente novamente.',
    };
  }

  if (
    msg.includes('invalid') && (msg.includes('to') || msg.includes('recipient') || msg.includes('email'))
  ) {
    return {
      code: 'RECIPIENT_INVALID',
      userMessage: 'O destinatário informado é inválido.',
    };
  }

  return {
    code: 'PROVIDER_ERROR',
    userMessage:
      'Não foi possível enviar o e-mail neste momento. Tente novamente em alguns minutos. Se o problema persistir, verifique a configuração do serviço de e-mail.',
  };
}

function sanitizeProviderMessage(raw: string): string {
  return String(raw || '')
    .replace(/re_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .slice(0, 240);
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      errorCode: 'API_KEY_MISSING',
      error:
        'O serviço de e-mail não está configurado. Defina RESEND_API_KEY no ambiente de produção.',
    };
  }

  const from = resolveResendFromAddress();
  if (!from) {
    return {
      ok: false,
      errorCode: 'FROM_MISSING',
      error:
        'O remetente de e-mail não está configurado. Defina RESEND_FROM no ambiente de produção (domínio verificado no Resend).',
    };
  }

  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  if (!to.length || to.some((addr) => !EMAIL_RE.test(addr))) {
    return {
      ok: false,
      errorCode: 'RECIPIENT_INVALID',
      error: 'O destinatário informado é inválido.',
    };
  }
  if (!String(input.subject || '').trim()) {
    return {
      ok: false,
      errorCode: 'PROVIDER_ERROR',
      error: 'Informe o assunto do e-mail.',
    };
  }

  const totalBytes = (input.attachments || []).reduce((sum, a) => {
    const len = Buffer.isBuffer(a.content)
      ? a.content.byteLength
      : a.content.byteLength;
    return sum + len;
  }, 0);
  if (totalBytes > MAX_ATTACHMENTS_BYTES) {
    return {
      ok: false,
      errorCode: 'ATTACHMENT_TOO_LARGE',
      error:
        'Os anexos excederam o tamanho permitido pelo serviço de e-mail. Remova alguns anexos e tente novamente.',
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
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

    if (error) {
      const classified = classifyResendProviderError(error.message || String(error));
      return {
        ok: false,
        errorCode: classified.code,
        error: classified.userMessage,
        providerMessageSafe: sanitizeProviderMessage(error.message || ''),
      };
    }

    return { ok: true, providerId: data?.id ?? null };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const classified = classifyResendProviderError(raw);
    return {
      ok: false,
      errorCode: classified.code,
      error: classified.userMessage,
      providerMessageSafe: sanitizeProviderMessage(raw),
    };
  }
}
