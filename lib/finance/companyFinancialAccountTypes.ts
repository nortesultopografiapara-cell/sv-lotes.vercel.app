import type { BankEnvironment } from '@/lib/banking/types';

export const COMPANY_FINANCIAL_ACCOUNT_TYPES = [
  'IMOBILIARIA',
  'PROPRIETARIO',
  'SPE',
  'PARCEIRO',
  'OUTRO',
] as const;

export type CompanyFinancialAccountType = (typeof COMPANY_FINANCIAL_ACCOUNT_TYPES)[number];

export type CompanyFinancialAccountRow = {
  id: string;
  company_id: string;
  name: string;
  account_type: CompanyFinancialAccountType;
  beneficiary_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  environment: BankEnvironment;
  bank_integration_id: string | null;
  is_default: boolean;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyFinancialAccountResponse = {
  id: string;
  companyId: string;
  name: string;
  accountType: CompanyFinancialAccountType;
  beneficiaryName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  environment: BankEnvironment;
  bankIntegrationId: string | null;
  isDefault: boolean;
  active: boolean;
  notes: string | null;
  hasSandboxApiKey: boolean;
  hasProductionApiKey: boolean;
  hasWebhookToken: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'WEBHOOK_INVALID';
  createdAt: string;
  updatedAt: string;
};

export const COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS: Record<CompanyFinancialAccountType, string> = {
  IMOBILIARIA: 'Imobiliária',
  PROPRIETARIO: 'Proprietário',
  SPE: 'SPE',
  PARCEIRO: 'Parceiro',
  OUTRO: 'Outro',
};

export function mapCompanyFinancialAccountRow(
  row: CompanyFinancialAccountRow,
  extras?: Partial<
    Pick<
      CompanyFinancialAccountResponse,
      | 'hasSandboxApiKey'
      | 'hasProductionApiKey'
      | 'hasWebhookToken'
      | 'connectionStatus'
    >
  >,
): CompanyFinancialAccountResponse {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    accountType: row.account_type,
    beneficiaryName: row.beneficiary_name,
    document: row.document,
    email: row.email,
    phone: row.phone,
    environment: row.environment,
    bankIntegrationId: row.bank_integration_id,
    isDefault: row.is_default,
    active: row.active,
    notes: row.notes,
    hasSandboxApiKey: extras?.hasSandboxApiKey ?? false,
    hasProductionApiKey: extras?.hasProductionApiKey ?? false,
    hasWebhookToken: extras?.hasWebhookToken ?? false,
    connectionStatus: extras?.connectionStatus ?? 'DISCONNECTED',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatFinancialAccountLabel(account: Pick<CompanyFinancialAccountResponse, 'name' | 'accountType' | 'beneficiaryName'>): string {
  const typeLabel = COMPANY_FINANCIAL_ACCOUNT_TYPE_LABELS[account.accountType] || account.accountType;
  const beneficiary = String(account.beneficiaryName || '').trim();
  if (beneficiary && beneficiary !== account.name) {
    return `${account.name} (${typeLabel} — ${beneficiary})`;
  }
  return `${account.name} (${typeLabel})`;
}

/** Garante resposta segura — nunca incluir segredos. */
export function assertCompanyFinancialAccountResponseSafe(
  response: CompanyFinancialAccountResponse | CompanyFinancialAccountResponse[],
): void {
  const forbidden = [
    'sandboxApiKey',
    'productionApiKey',
    'webhookToken',
    'encrypted_payload',
    'apiKey',
    'access_token',
  ];
  const json = JSON.stringify(response);
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Resposta de conta financeira expõe campo proibido: ${key}`);
    }
  }
}
