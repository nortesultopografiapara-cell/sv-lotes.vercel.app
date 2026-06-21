/**
 * Provider Z-API — envio de mensagens WhatsApp.
 */

export const ZAPI_SEND_TEXT_BASE_URL = 'https://api.z-api.io';

export type ZapiSendTextInput = {
  phone: string;
  message: string;
};

export type ZapiSendTextResult = {
  ok: boolean;
  messageId?: string | null;
  error?: string;
};

export function isZapiConfigured(): boolean {
  return !!(
    String(process.env.ZAPI_INSTANCE_ID || '').trim() &&
    String(process.env.ZAPI_INSTANCE_TOKEN || '').trim()
  );
}

export function resolveZapiSendTextUrl(): string | null {
  const instanceId = String(process.env.ZAPI_INSTANCE_ID || '').trim();
  const token = String(process.env.ZAPI_INSTANCE_TOKEN || '').trim();
  if (!instanceId || !token) return null;

  return `${ZAPI_SEND_TEXT_BASE_URL}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`;
}

export async function sendText(input: ZapiSendTextInput): Promise<ZapiSendTextResult> {
  const url = resolveZapiSendTextUrl();
  if (!url) {
    return { ok: false, error: 'Z-API não configurada.' };
  }

  const phone = String(input.phone || '').trim();
  if (!phone) {
    return { ok: false, error: 'Número destino inválido.' };
  }

  const message = String(input.message || '').trim();
  if (!message) {
    return { ok: false, error: 'Mensagem vazia.' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message }),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const nestedError = body.error as { message?: string } | string | undefined;
      const msg =
        (typeof nestedError === 'object' && nestedError?.message) ||
        (typeof nestedError === 'string' ? nestedError : null) ||
        (typeof body.message === 'string' ? body.message : null) ||
        `HTTP ${response.status}`;
      return { ok: false, error: msg };
    }

    const messageId =
      (typeof body.messageId === 'string' ? body.messageId : null) ||
      (typeof body.zaapId === 'string' ? body.zaapId : null) ||
      (typeof body.id === 'string' ? body.id : null);

    return { ok: true, messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao enviar WhatsApp via Z-API.',
    };
  }
}
