/**
 * Envio genérico via Resend (orçamentos Topografia e reuso pontual).
 * Remetente exclusivamente via RESEND_FROM — sem fallback silencioso em produção.
 * SaaS billing mantém helper próprio em lib/saasBillingReminderEmail.ts.
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
  | 'SENDER_NOT_CONFIGURED'
  | 'DOMAIN_UNVERIFIED'
  | 'RECIPIENT_INVALID'
  | 'ATTACHMENT_TOO_LARGE'
  | 'PROVIDER_ERROR';

export type ResendSendResult = {
  ok: boolean;
  providerId?: string | null;
  /** Remetente efetivamente enviado (só em sucesso; para auditoria/testes). */
  fromUsed?: string | null;
  replyToUsed?: string | null;
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

/** Nunca usar como fallback — domínio de teste do Resend. */
const FORBIDDEN_FROM_FALLBACKS = ['onboarding@resend.dev'];

export function isResendEmailConfigured(): boolean {
  return !!String(process.env.RESEND_API_KEY || '').trim();
}

export function isProductionEmailRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Extrai o endereço puro de "Nome <email@dominio>" ou retorna o valor se já for e-mail.
 */
export function extractEmailAddressFromFromHeader(from: string): string | null {
  const raw = String(from || '').trim();
  if (!raw) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim();
  return EMAIL_RE.test(candidate) ? candidate : null;
}

/**
 * Remetente exclusivo via env. Sem fallback para onboarding@resend.dev.
 * Aceita RESEND_FROM_EMAIL apenas como alias legado do mesmo valor.
 */
export function resolveResendFromAddress(): string | null {
  const from = String(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
  if (!from) return null;
  const emailOnly = extractEmailAddressFromFromHeader(from)?.toLowerCase() || from.toLowerCase();
  if (FORBIDDEN_FROM_FALLBACKS.some((bad) => emailOnly === bad || emailOnly.includes(bad))) {
    // Valor explícito de teste do Resend não é tratado como “configurado” para orçamentos.
    if (isProductionEmailRuntime()) return null;
  }
  return from;
}

/**
 * Reply-To: RESEND_REPLY_TO, senão e-mail extraído de RESEND_FROM.
 */
export function resolveResendReplyToAddress(fromHeader?: string | null): string | null {
  const explicit = String(process.env.RESEND_REPLY_TO || '').trim();
  if (explicit && EMAIL_RE.test(explicit)) return explicit;
  const from = fromHeader ?? resolveResendFromAddress();
  if (!from) return null;
  return extractEmailAddressFromFromHeader(from);
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
        'O domínio do remetente ainda não está verificado no serviço de e-mail. Verifique o domínio no Resend e tente novamente.',
    };
  }

  if (
    msg.includes('too large') ||
    msg.includes('payload too large') ||
    (msg.includes('attachment') && msg.includes('size')) ||
    msg.includes('413')
  ) {
    return {
      code: 'ATTACHMENT_TOO_LARGE',
      userMessage:
        'Os anexos excederam o tamanho permitido pelo serviço de e-mail. Remova alguns anexos e tente novamente.',
    };
  }

  if (
    msg.includes('invalid') &&
    (msg.includes('to') || msg.includes('recipient') || msg.includes('email'))
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
      errorCode: 'SENDER_NOT_CONFIGURED',
      error:
        'O remetente de e-mail não está configurado. Defina RESEND_FROM no ambiente de produção (domínio verificado no Resend).',
    };
  }

  const replyTo = resolveResendReplyToAddress(from);

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
    const payload = buildResendEmailApiPayload(input, from, replyTo);
    const { data, error } = await resend.emails.send(payload);

    if (error) {
      const classified = classifyResendProviderError(error.message || String(error));
      return {
        ok: false,
        errorCode: classified.code,
        error: classified.userMessage,
        providerMessageSafe: sanitizeProviderMessage(error.message || ''),
      };
    }

    return {
      ok: true,
      providerId: data?.id ?? null,
      fromUsed: from,
      replyToUsed: replyTo,
    };
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

/** Monta o payload da API Resend (testável sem rede). */
export function buildResendEmailApiPayload(
  input: ResendSendInput,
  from: string,
  replyTo: string | null,
): {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    content_type?: string;
  }>;
} {
  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => String(t || '').trim())
    .filter(Boolean);

  const payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
    reply_to?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      content_type?: string;
    }>;
  } = {
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
  };
  if (replyTo) payload.reply_to = replyTo;
  return payload;
}
