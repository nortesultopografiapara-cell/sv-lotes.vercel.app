import type { BankEnvironment } from './types';

/** Snapshot mínimo para validar integração Sicoob (Fase 2.0 — sem API real). */
export type SicoobConfigValidationInput = {
  clientId?: string;
  /** Valor novo digitado no formulário (opcional se já salvo). */
  clientSecret?: string;
  hasClientSecret?: boolean;
  environment?: BankEnvironment | string;
  agency?: string;
  accountNumber?: string;
  accountDigit?: string;
  walletCode?: string;
  agreementCode?: string;
  beneficiaryCode?: string;
  pixKey?: string;
  certificateName?: string;
  certificatePassword?: string;
  hasCertificatePassword?: boolean;
};

export type SicoobConfigValidationResult = {
  ok: boolean;
  missingFields: string[];
  message: string;
};

const FIELD_LABELS: Record<string, string> = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  environment: 'Ambiente',
  agency: 'Agência',
  accountNumber: 'Conta',
  accountDigit: 'Dígito',
  walletCode: 'Carteira',
  agreementCode: 'Convênio',
  beneficiaryCode: 'Código do beneficiário',
  pixKey: 'Chave Pix',
  certificateName: 'Nome do certificado',
  certificatePassword: 'Senha do certificado',
};

function isNonEmpty(value: string | undefined | null): boolean {
  return String(value ?? '').trim().length > 0;
}

function isValidEnvironment(value: string | undefined): value is BankEnvironment {
  return value === 'SANDBOX' || value === 'PRODUCTION';
}

/** Valida campos obrigatórios Sicoob — não chama API externa. */
export function validateSicoobConfig(
  input: SicoobConfigValidationInput,
): SicoobConfigValidationResult {
  const missingFields: string[] = [];

  if (!isNonEmpty(input.clientId)) missingFields.push('clientId');
  if (!isNonEmpty(input.clientSecret) && !input.hasClientSecret) missingFields.push('clientSecret');
  if (!isValidEnvironment(String(input.environment ?? '').trim() as BankEnvironment)) {
    missingFields.push('environment');
  }
  if (!isNonEmpty(input.agency)) missingFields.push('agency');
  if (!isNonEmpty(input.accountNumber)) missingFields.push('accountNumber');
  if (!isNonEmpty(input.accountDigit)) missingFields.push('accountDigit');
  if (!isNonEmpty(input.walletCode)) missingFields.push('walletCode');
  if (!isNonEmpty(input.agreementCode)) missingFields.push('agreementCode');
  if (!isNonEmpty(input.beneficiaryCode)) missingFields.push('beneficiaryCode');
  if (!isNonEmpty(input.pixKey)) missingFields.push('pixKey');
  if (!isNonEmpty(input.certificateName)) missingFields.push('certificateName');
  if (!isNonEmpty(input.certificatePassword) && !input.hasCertificatePassword) {
    missingFields.push('certificatePassword');
  }

  if (missingFields.length === 0) {
    return {
      ok: true,
      missingFields: [],
      message:
        'Configuração Sicoob válida. API real ainda não habilitada nesta fase (Fase 2.0).',
    };
  }

  const labels = missingFields.map((key) => FIELD_LABELS[key] ?? key);
  return {
    ok: false,
    missingFields,
    message: `Campos obrigatórios Sicoob ausentes: ${labels.join(', ')}.`,
  };
}

export function sicoobValidationInputFromIntegration(
  integration: {
    clientId?: string;
    environment?: string;
    agency?: string;
    account?: string;
    accountDigit?: string;
    walletCode?: string;
    agreementCode?: string;
    beneficiaryCode?: string;
    pixKey?: string;
    certificateName?: string;
    hasClientSecret?: boolean;
    hasCertificatePassword?: boolean;
  },
  overrides?: {
    clientSecret?: string;
    certificatePassword?: string;
  },
): SicoobConfigValidationInput {
  return {
    clientId: integration.clientId,
    clientSecret: overrides?.clientSecret,
    hasClientSecret: integration.hasClientSecret,
    environment: integration.environment,
    agency: integration.agency,
    accountNumber: integration.account,
    accountDigit: integration.accountDigit,
    walletCode: integration.walletCode,
    agreementCode: integration.agreementCode,
    beneficiaryCode: integration.beneficiaryCode,
    pixKey: integration.pixKey,
    certificateName: integration.certificateName,
    certificatePassword: overrides?.certificatePassword,
    hasCertificatePassword: integration.hasCertificatePassword,
  };
}
