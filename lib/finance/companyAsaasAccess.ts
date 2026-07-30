import { TOPOGRAFIA_COMPANY_ID } from '@/lib/companySettingsLayout';
import { MENESES_COMPANY_ID } from '@/lib/saasContractContent';

/** Lista CSV de company IDs (modo restrito / piloto legado). */
export const ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV = 'ASAAS_COMPANY_ALLOWED_COMPANY_IDS' as const;

/** Espelho público legado (UI não depende mais deste gate). */
export const ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV =
  'NEXT_PUBLIC_ASAAS_COMPANY_ALLOWED_COMPANY_IDS' as const;

/**
 * Quando `true`, restringe Asaas Company à allowlist.
 * Padrão SaaS multi-tenant: desligado — qualquer empresa autenticada
 * pode cadastrar token/conta próprios (sem copiar credenciais de outra).
 */
export const ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV =
  'ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST' as const;

/** Empresas de referência sempre presentes na allowlist (modo restrito). */
export const ASAAS_COMPANY_DEFAULT_ALLOWED_COMPANY_IDS: readonly string[] = [
  TOPOGRAFIA_COMPANY_ID,
  MENESES_COMPANY_ID,
];

export const COMPANY_ASAAS_ACCESS_DENIED_MESSAGE =
  'Integração Asaas Company não disponível para esta empresa.';

function parseAllowedCompanyIdsRaw(raw: string | undefined | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseRestrictFlag(raw: string | undefined | null): boolean {
  return String(raw ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function readAllowedCompanyIdsFromEnv(): string[] {
  const isBrowser = typeof window !== 'undefined';
  const raw = isBrowser
    ? process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV] ??
      process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV]
    : process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_ENV] ??
      process.env[ASAAS_COMPANY_ALLOWED_COMPANY_IDS_PUBLIC_ENV];

  const parsed = parseAllowedCompanyIdsRaw(raw);
  const merged = new Set<string>([
    ...ASAAS_COMPANY_DEFAULT_ALLOWED_COMPANY_IDS,
    ...parsed,
  ]);
  return [...merged];
}

let cachedIds: string[] | null = null;
let cachedRestrict: boolean | null = null;

/** IDs da allowlist (env ∪ defaults). Usado só no modo restrito. */
export function getCompanyAsaasAllowedCompanyIds(): string[] {
  if (!cachedIds) {
    cachedIds = readAllowedCompanyIdsFromEnv();
  }
  return cachedIds;
}

/** true = piloto restrito; false (padrão) = todas as empresas. */
export function isCompanyAsaasAllowlistRestricted(): boolean {
  if (cachedRestrict == null) {
    cachedRestrict = parseRestrictFlag(
      process.env[ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV],
    );
  }
  return cachedRestrict;
}

/**
 * Gate Asaas Company por tenant.
 * - companyId vazio → bloqueado
 * - modo restrito → allowlist
 * - padrão → qualquer empresa autenticada (cadastro próprio de token/conta)
 */
export function isCompanyAsaasEnabled(companyId: string | null | undefined): boolean {
  const normalized = String(companyId ?? '').trim().toLowerCase();
  if (!normalized) return false;

  if (!isCompanyAsaasAllowlistRestricted()) {
    return true;
  }

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

/**
 * Provisionamento estrutural na criação de empresa.
 * Contas/tokens Asaas NÃO são pré-criados (empresa cadastra credenciais próprias).
 * Retorna metadados para auditoria/logs — idempotente e sem side effects em DB.
 */
export function describeCompanyAsaasProvision(companyId: string): {
  companyId: string;
  asaasAccessEnabled: boolean;
  financialAccountsPreseeded: false;
  credentialsPreseeded: false;
  note: string;
} {
  return {
    companyId,
    asaasAccessEnabled: isCompanyAsaasEnabled(companyId),
    financialAccountsPreseeded: false,
    credentialsPreseeded: false,
    note:
      'Asaas Company liberado para a empresa cadastrar conta/token próprios em Configurações → Integração Financeira.',
  };
}
