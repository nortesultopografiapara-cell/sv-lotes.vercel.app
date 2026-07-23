/** Domínio e helpers — Asaas Financeiro Corporativo MASTER (Fase 7). */

export const MASTER_CORPORATE_ASAAS_DOMAIN = 'MASTER_CORPORATE_FINANCE' as const;

export const MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX = 'MCF:' as const;

/** Variáveis server-side obrigatórias (nunca NEXT_PUBLIC). */
export const MASTER_CORPORATE_ASAAS_ENV_KEYS = {
  apiKey: 'ASAAS_API_KEY',
  env: 'ASAAS_ENV',
  webhookToken: 'ASAAS_CORPORATE_WEBHOOK_TOKEN',
} as const;

export function buildCorporateAsaasExternalReference(
  receivableId: string,
  suffix?: string | null,
): string {
  const id = String(receivableId || '').trim();
  if (!id) throw new Error('receivable_id obrigatório para external_reference.');
  const s = suffix ? String(suffix).trim() : '';
  return s
    ? `${MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX}${id}:${s}`
    : `${MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX}${id}`;
}

export function parseCorporateAsaasExternalReference(
  ref: string | null | undefined,
): { receivableId: string; suffix: string | null } | null {
  const raw = String(ref || '').trim();
  if (!raw.startsWith(MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX)) return null;
  const rest = raw.slice(MASTER_CORPORATE_ASAAS_EXTERNAL_REF_PREFIX.length);
  if (!rest) return null;
  const [receivableId, ...parts] = rest.split(':');
  if (!receivableId) return null;
  return {
    receivableId,
    suffix: parts.length ? parts.join(':') : null,
  };
}

export function isCorporateAsaasDomain(value: unknown): boolean {
  return String(value || '').trim() === MASTER_CORPORATE_ASAAS_DOMAIN;
}

export function resolveCorporateAsaasEnvironment(
  raw: string | null | undefined = process.env.ASAAS_ENV,
): 'sandbox' | 'production' {
  return String(raw || 'sandbox').trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox';
}

/** Falha segura se token dedicado ausente — sem fallback inseguro. */
export function requireCorporateAsaasWebhookToken(): string {
  const token = String(process.env.ASAAS_CORPORATE_WEBHOOK_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'ASAAS_CORPORATE_WEBHOOK_TOKEN não configurado. Configure a variável server-side no Preview antes de receber webhooks corporativos.',
    );
  }
  return token;
}

export function requireCorporateAsaasApiKey(): string {
  const key = String(process.env.ASAAS_API_KEY || '').trim();
  if (!key) {
    throw new Error('ASAAS_API_KEY não configurada (conta corporativa SV Topografia).');
  }
  return key;
}

export function maskCpfCnpj(doc: string | null | undefined): string {
  const digits = String(doc || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
  }
  if (!digits) return '—';
  return `***${digits.slice(-4)}`;
}
