/**
 * Provider Z-API — envio de mensagens WhatsApp.
 */

export const ZAPI_SEND_TEXT_BASE_URL = 'https://api.z-api.io';

export type ZapiConfigStatus = {
  instanceConfigured: boolean;
  instanceHint: string | null;
  tokenConfigured: boolean;
  tokenHint: string | null;
  clientTokenConfigured: boolean;
  clientTokenHint: string | null;
  ready: boolean;
};

export type ZapiSendTextInput = {
  phone: string;
  message: string;
};

export type ZapiRequestDiagnostics = {
  instanceId: string;
  instanceIdLength: number;
  tokenMasked: string;
  tokenLength: number;
  requestUrlMasked: string;
  requestUrlPatternOk: boolean;
  usesEnvInstanceId: boolean;
  usesEnvInstanceToken: boolean;
  clientTokenConfigured: boolean;
  clientTokenMasked: string;
  configWarnings: string[];
};

export type ZapiSendTextResult = {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  debug?: ZapiRequestDiagnostics & {
    httpStatus?: number;
    responseBody?: unknown;
    responseText?: string;
  };
};

export function maskZapiSecret(value: string, visible = 4): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '(vazio)';
  if (trimmed.length <= visible * 2) return '*'.repeat(trimmed.length);
  return `${trimmed.slice(0, visible)}…${trimmed.slice(-visible)}`;
}

/** Exibe apenas os últimos 4 caracteres (diagnóstico UI). */
export function maskZapiSuffixOnly(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return '****';
  return `…${trimmed.slice(-4)}`;
}

/** Token da instância — aceita ZAPI_INSTANCE_TOKEN ou alias legado ZAPI_TOKEN. */
export function resolveZapiInstanceToken(): string {
  return String(process.env.ZAPI_INSTANCE_TOKEN || process.env.ZAPI_TOKEN || '').trim();
}

export function buildZapiSendTextUrl(instanceId: string, token: string): string {
  return `${ZAPI_SEND_TEXT_BASE_URL}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/send-text`;
}

export function maskZapiRequestUrl(url: string, token: string): string {
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) return url;
  const encodedToken = encodeURIComponent(trimmedToken);
  return url
    .replace(trimmedToken, maskZapiSecret(trimmedToken))
    .replace(encodedToken, maskZapiSecret(trimmedToken));
}

export function getZapiConfigStatus(): ZapiConfigStatus {
  const instanceId = String(process.env.ZAPI_INSTANCE_ID || '').trim();
  const token = resolveZapiInstanceToken();
  const clientToken = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

  return {
    instanceConfigured: !!instanceId,
    instanceHint: maskZapiSuffixOnly(instanceId),
    tokenConfigured: !!token,
    tokenHint: maskZapiSuffixOnly(token),
    clientTokenConfigured: !!clientToken,
    clientTokenHint: maskZapiSuffixOnly(clientToken),
    ready: !!(instanceId && token),
  };
}

export function buildZapiRequestDiagnostics(): ZapiRequestDiagnostics | null {
  const instanceId = String(process.env.ZAPI_INSTANCE_ID || '').trim();
  const token = resolveZapiInstanceToken();
  const clientToken = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

  if (!instanceId || !token) return null;

  const requestUrl = buildZapiSendTextUrl(instanceId, token);
  const expectedPrefix = `${ZAPI_SEND_TEXT_BASE_URL}/instances/`;
  const expectedSuffix = '/send-text';
  const configWarnings: string[] = [];

  if (instanceId.includes('http') || instanceId.includes('/instances/')) {
    configWarnings.push('ZAPI_INSTANCE_ID parece conter URL completa — use apenas o ID da instância.');
  }
  if (token.includes('http') || token.includes('/token/')) {
    configWarnings.push('ZAPI_INSTANCE_TOKEN parece conter URL — use apenas o token da instância.');
  }
  if (instanceId.includes(' ')) {
    configWarnings.push('ZAPI_INSTANCE_ID contém espaços — verifique aspas/quebras na Vercel.');
  }
  if (token.includes(' ')) {
    configWarnings.push('ZAPI_INSTANCE_TOKEN contém espaços — verifique aspas/quebras na Vercel.');
  }
  if (!clientToken) {
    configWarnings.push(
      'ZAPI_CLIENT_TOKEN não configurado (opcional) — algumas contas Z-API exigem header Client-Token.',
    );
  }

  return {
    instanceId,
    instanceIdLength: instanceId.length,
    tokenMasked: maskZapiSecret(token),
    tokenLength: token.length,
    requestUrlMasked: maskZapiRequestUrl(requestUrl, token),
    requestUrlPatternOk:
      requestUrl.startsWith(expectedPrefix) &&
      requestUrl.includes('/token/') &&
      requestUrl.endsWith(expectedSuffix),
    usesEnvInstanceId: instanceId === String(process.env.ZAPI_INSTANCE_ID || '').trim(),
    usesEnvInstanceToken: token === resolveZapiInstanceToken(),
    clientTokenConfigured: !!clientToken,
    clientTokenMasked: clientToken ? maskZapiSecret(clientToken) : '(nao configurado)',
    configWarnings,
  };
}

export function isZapiConfigured(): boolean {
  return getZapiConfigStatus().ready;
}

export function resolveZapiSendTextUrl(): string | null {
  const instanceId = String(process.env.ZAPI_INSTANCE_ID || '').trim();
  const token = resolveZapiInstanceToken();
  if (!instanceId || !token) return null;

  return buildZapiSendTextUrl(instanceId, token);
}

function logZapiDiagnostics(
  phase: 'request' | 'response',
  diagnostics: ZapiRequestDiagnostics,
  extra?: Record<string, unknown>,
): void {
  console.log(
    `[zapi-send-text:${phase}]`,
    JSON.stringify({
      instanceId: diagnostics.instanceId,
      instanceIdLength: diagnostics.instanceIdLength,
      tokenMasked: diagnostics.tokenMasked,
      tokenLength: diagnostics.tokenLength,
      requestUrlMasked: diagnostics.requestUrlMasked,
      requestUrlPatternOk: diagnostics.requestUrlPatternOk,
      clientTokenConfigured: diagnostics.clientTokenConfigured,
      clientTokenMasked: diagnostics.clientTokenMasked,
      ...extra,
    }),
  );
}

export async function sendText(input: ZapiSendTextInput): Promise<ZapiSendTextResult> {
  const diagnostics = buildZapiRequestDiagnostics();
  const url = resolveZapiSendTextUrl();
  if (!url || !diagnostics) {
    return { ok: false, error: 'Z-API não configurada.' };
  }

  const phone = String(input.phone || '').trim();
  if (!phone) {
    return { ok: false, error: 'Número destino inválido.', debug: diagnostics };
  }

  const message = String(input.message || '').trim();
  if (!message) {
    return { ok: false, error: 'Mensagem vazia.', debug: diagnostics };
  }

  const clientToken = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

  logZapiDiagnostics('request', diagnostics, {
    phone,
    messageLength: message.length,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone, message }),
    });

    const responseText = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
    } catch {
      body = { raw: responseText };
    }

    logZapiDiagnostics('response', diagnostics, {
      httpStatus: response.status,
      responseBody: body,
    });

    const debug = {
      ...diagnostics,
      httpStatus: response.status,
      responseBody: body,
      responseText,
    };

    if (!response.ok) {
      const nestedError = body.error as { message?: string } | string | undefined;
      const msg =
        (typeof nestedError === 'object' && nestedError?.message) ||
        (typeof nestedError === 'string' ? nestedError : null) ||
        (typeof body.message === 'string' ? body.message : null) ||
        `HTTP ${response.status}`;
      return { ok: false, error: msg, debug };
    }

    const messageId =
      (typeof body.messageId === 'string' ? body.messageId : null) ||
      (typeof body.zaapId === 'string' ? body.zaapId : null) ||
      (typeof body.id === 'string' ? body.id : null);

    return { ok: true, messageId, debug };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar WhatsApp via Z-API.';
    console.log(
      '[zapi-send-text:response]',
      JSON.stringify({
        instanceId: diagnostics.instanceId,
        tokenMasked: diagnostics.tokenMasked,
        requestUrlMasked: diagnostics.requestUrlMasked,
        error: message,
      }),
    );
    return {
      ok: false,
      error: message,
      debug: diagnostics,
    };
  }
}
