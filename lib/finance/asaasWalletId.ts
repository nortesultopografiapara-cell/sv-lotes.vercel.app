import type { BankEnvironment } from '@/lib/banking/types';

/** Endpoint oficial Asaas — Retrieve WalletId da conta autenticada. */
export const ASAAS_OWN_WALLETS_PATH = '/wallets/' as const;

export const ASAAS_SANDBOX_API_HOST = 'api-sandbox.asaas.com';
export const ASAAS_PRODUCTION_API_HOST = 'api.asaas.com';

export const ASAAS_WALLET_MISSING_API_KEY_MESSAGE =
  'API Key Asaas não configurada para esta conta financeira.';
export const ASAAS_WALLET_INVALID_KEY_MESSAGE =
  'API Key Asaas inválida para o ambiente desta conta.';
export const ASAAS_WALLET_EMPTY_RESPONSE_MESSAGE =
  'Asaas não retornou Wallet ID para esta conta.';
export const ASAAS_WALLET_SANDBOX_KEY_ON_PRODUCTION_MESSAGE =
  'A API Key Sandbox não pode ser usada no ambiente Production.';
export const ASAAS_WALLET_PRODUCTION_KEY_ON_SANDBOX_MESSAGE =
  'A API Key Production não pode ser usada no ambiente Sandbox.';

export type AsaasWalletListItem = {
  object?: string;
  id?: string;
};

export type AsaasWalletListResponse = {
  object?: string;
  data?: AsaasWalletListItem[];
};

export function asaasCompanyHostForEnvironment(environment: BankEnvironment): string {
  return environment === 'PRODUCTION' ? ASAAS_PRODUCTION_API_HOST : ASAAS_SANDBOX_API_HOST;
}

export function assertAsaasCompanyRequestHost(environment: BankEnvironment, url: string): void {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('URL Asaas inválida.');
  }
  const expected = asaasCompanyHostForEnvironment(environment);
  if (host !== expected) {
    throw new Error(
      environment === 'PRODUCTION'
        ? 'Ambiente Production não pode consultar o host Sandbox do Asaas.'
        : 'Ambiente Sandbox não pode consultar o host Production do Asaas.',
    );
  }
}

export function extractAsaasOwnWalletId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const data = (payload as AsaasWalletListResponse).data;
  if (!Array.isArray(data)) return '';
  for (const item of data) {
    const id = String(item?.id || '').trim();
    if (id) return id;
  }
  return '';
}

export function maskAsaasWalletId(walletId: string): string {
  const raw = String(walletId || '').trim();
  if (!raw) return '';
  const last = raw.slice(-4);
  if (/^wal_/i.test(raw)) return `wal_••••••••${last}`;
  return `••••••••${last}`;
}

export function assertAsaasApiKeyMatchesEnvironment(
  apiKey: string,
  environment: BankEnvironment,
): void {
  const key = String(apiKey || '');
  const isSandboxKey = /aact_hmlg_/i.test(key);
  const isProductionKey = /aact_prod_/i.test(key);
  if (environment === 'PRODUCTION' && isSandboxKey) {
    throw new Error(ASAAS_WALLET_SANDBOX_KEY_ON_PRODUCTION_MESSAGE);
  }
  if (environment === 'SANDBOX' && isProductionKey) {
    throw new Error(ASAAS_WALLET_PRODUCTION_KEY_ON_SANDBOX_MESSAGE);
  }
}

export function sanitizeAsaasPublicError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  const stripped = raw
    .replace(/\$aact_[A-Za-z0-9_]+/gi, '[redacted]')
    .replace(/aact_[A-Za-z0-9_]+/gi, '[redacted]')
    .replace(/access_token/gi, 'credential');
  if (!stripped.trim()) return ASAAS_WALLET_INVALID_KEY_MESSAGE;
  if (/invalid_access_token|chave de api|inválida|invalida|unauthorized|não autorizad|http 401/i.test(stripped)) {
    return ASAAS_WALLET_INVALID_KEY_MESSAGE;
  }
  if (/não configurada|nao configurada|ausente/i.test(stripped)) {
    return ASAAS_WALLET_MISSING_API_KEY_MESSAGE;
  }
  return stripped.slice(0, 280);
}

export function rejectAsaasSecretInRequestBody(body: Record<string, unknown> | null | undefined): string | null {
  if (!body || typeof body !== 'object') return null;
  const forbidden = [
    'apiKey',
    'api_key',
    'sandboxApiKey',
    'sandbox_api_key',
    'productionApiKey',
    'production_api_key',
    'webhookToken',
    'webhook_token',
    'access_token',
  ];
  for (const key of forbidden) {
    if (body[key]) return 'Não envie API key, token ou senha. Use a credencial já salva na conta.';
  }
  return null;
}
