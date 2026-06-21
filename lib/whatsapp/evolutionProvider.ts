/**
 * Provider Evolution API — envio de mensagens WhatsApp.
 */

export type EvolutionSendTextResult = {
  ok: boolean;
  messageId?: string | null;
  error?: string;
};

export function isEvolutionApiConfigured(): boolean {
  return !!(
    String(process.env.EVOLUTION_API_URL || '').trim() &&
    String(process.env.EVOLUTION_API_KEY || '').trim() &&
    String(process.env.EVOLUTION_INSTANCE_NAME || '').trim()
  );
}

export function resolveEvolutionApiConfig(): {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
} | null {
  const baseUrl = String(process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim();
  const instanceName = String(process.env.EVOLUTION_INSTANCE_NAME || '').trim();

  if (!baseUrl || !apiKey || !instanceName) return null;
  return { baseUrl, apiKey, instanceName };
}

export async function sendEvolutionTextMessage(
  number: string,
  text: string,
): Promise<EvolutionSendTextResult> {
  const config = resolveEvolutionApiConfig();
  if (!config) {
    return { ok: false, error: 'Evolution API não configurada.' };
  }

  const destination = String(number || '').trim();
  if (!destination) {
    return { ok: false, error: 'Número destino inválido.' };
  }

  const message = String(text || '').trim();
  if (!message) {
    return { ok: false, error: 'Mensagem vazia.' };
  }

  const url = `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number: destination, text: message }),
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

    const key = body.key as { id?: string } | undefined;
    const messageId =
      key?.id ||
      (typeof body.messageId === 'string' ? body.messageId : null) ||
      (typeof body.id === 'string' ? body.id : null);

    return { ok: true, messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao enviar WhatsApp via Evolution API.',
    };
  }
}
