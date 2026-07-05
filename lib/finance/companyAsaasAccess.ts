import { TOPOGRAFIA_COMPANY_ID } from '@/lib/companySettingsLayout';

/** Lista CSV de company IDs autorizados a usar Asaas Company (server). */
export const ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV = 'ASAAS_COMPANY_ALLOWED_COMPANY_IDS' as const;

/** Espelho público para gate de UI no client (mesma lista do server). */
export const ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV =
  'NEXT_PUBLIC_ASAAS_COMPANY_ALLOWED_COMPANY_IDS' as const;

/** Empresa piloto — SV Topografia. */
export const ASAAS_COMPANY_DEFAULT_ALLOWED_COMPANY_IDS: readonly string[] = [
  TOPOGRAFIA_COMPANY_ID,
];

export const COMPANY_ASAAS_ACCESS_DENIED_MESSAGE =
  'Integração Asaas Company não disponível para esta empresa.';

function parseAllowedCompanyIdsRaw(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function readAllowedCompanyIdsFromEnv(): string[] {
  const isBrowser = typeof window !== 'undefined';
  const raw = isBrowser
    ? process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV] ??
      process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV]
    : process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV] ??
      process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV];

  const parsed = parseAllowedCompanyIdsRaw(raw);
  if (parsed.length > 0) return parsed;
  return [...ASAAS_COMPANY_DEFAULT_ALLOWED_COMPANY_IDS];
}

let cachedIds: string[] | null = null;

/** IDs autorizados (env CSV ou fallback SV Topografia). */
export function getCompanyAsaasAllowedCompanyIds(): string[] {
  if (!cachedIds) {
    cachedIds = readAllowedCompanyIdsFromEnv();
  }
  return cachedIds;
}

/** Gate controlado — true apenas para empresas na whitelist. */
export function isCompanyAsaasEnabled(companyId: string | null | undefined): boolean {
  const normalized = String(companyId ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return getCompanyAsaasAllowedCompanyIds().some(
    (id) => id.trim().toLowerCase() === normalized,
  );
}

export class CompanyAsaasAccessDeniedError extends Error {
  constructor(message = COMPANY_ASAAS_ACCESS_DENIED_MESSAGE) {
    super(message);
    this.name = 'CompanyAsaasAccessDeniedError';
  }
}

export function assertCompanyAsaasEnabled(companyId: string): void {
  if (!isCompanyAsaasEnabled(companyId)) {
    throw new CompanyAsaasAccessDeniedError();
  }
}
