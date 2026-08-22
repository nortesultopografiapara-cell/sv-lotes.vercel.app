/**
 * Seleção do modelo de contrato de compra e venda.
 *
 * Prioridade efetiva na venda/geração:
 *   snapshot da venda → snapshot do contrato → projeto → empresa → PADRAO
 */

export const SALE_CONTRACT_MODELS = [
  'PADRAO',
  'SV_LOTES_2',
  'RECANTO_PRIMAVERA',
  'MENESES',
  'ARAGUAIA',
  'CUSTOM',
] as const;

export type SaleContractModel = (typeof SALE_CONTRACT_MODELS)[number];

export const SALE_CONTRACT_MODEL_LABELS: Record<SaleContractModel, string> = {
  PADRAO: 'Padrão SV LOTES',
  SV_LOTES_2: 'SV LOTES 2.0 (RECOMENDADO)',
  RECANTO_PRIMAVERA: 'Recanto Primavera',
  MENESES: 'Meneses',
  ARAGUAIA: 'Chacreamento Araguaia',
  CUSTOM: 'Personalizado (futuro)',
};

/** Modelos selecionáveis na UI de projeto/empresa (exclui CUSTOM até existir template). */
export const SALE_CONTRACT_MODEL_OPTIONS: SaleContractModel[] = [
  'PADRAO',
  'SV_LOTES_2',
  'RECANTO_PRIMAVERA',
  'MENESES',
  'ARAGUAIA',
];

export const PROJECT_CONTRACT_MODEL_INHERIT = '';

export const MISSING_PROJECT_CONTRACT_MODEL_MESSAGE =
  'Este empreendimento não possui um modelo de contrato configurado.';

export type SaleContractModelSource =
  | 'sale'
  | 'contract'
  | 'project'
  | 'company'
  | 'ui'
  | 'fallback';

export function normalizeSaleContractModel(
  raw: unknown,
): SaleContractModel {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  if (
    value === 'SV_LOTES_2' ||
    value === 'SV_LOTES_20' ||
    value.includes('SV_LOTES_2') ||
    value.includes('2_0')
  ) {
    return 'SV_LOTES_2';
  }
  if (
    value === 'RECANTO_PRIMAVERA' ||
    value === 'RECANTO PRIMAVERA' ||
    value.includes('RECANTO')
  ) {
    return 'RECANTO_PRIMAVERA';
  }
  if (value === 'MENESES') {
    return 'MENESES';
  }
  if (
    value === 'ARAGUAIA' ||
    value === 'CHACREAMENTO_ARAGUAIA' ||
    value.includes('ARAGUAIA')
  ) {
    return 'ARAGUAIA';
  }
  if (value === 'CUSTOM' || value === 'PERSONALIZADO') {
    return 'CUSTOM';
  }
  return 'PADRAO';
}

/**
 * Interpreta valor opcional de projeto/formulário.
 * vazio / null / "COMPANY_DEFAULT" → herdar empresa (null).
 */
export function parseOptionalSaleContractModel(
  raw: unknown,
): SaleContractModel | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (
    !value ||
    value === PROJECT_CONTRACT_MODEL_INHERIT ||
    value.toUpperCase() === 'COMPANY_DEFAULT' ||
    value.toUpperCase() === 'INHERIT' ||
    value.toUpperCase() === 'EMPRESA'
  ) {
    return null;
  }
  return normalizeSaleContractModel(value);
}

export function resolveSaleContractModel(
  company: Record<string, unknown> | null | undefined,
): SaleContractModel {
  return normalizeSaleContractModel(company?.contract_model);
}

/**
 * Nome canônico do empreendimento de homologação Preview do modelo ARAGUAIA.
 * Usado somente fora de Production quando Preview e Production compartilham o mesmo banco
 * (não gravar `projects.contract_model` em Production sem autorização).
 */
export const PREVIEW_ARAGUAIA_PROJECT_NAME = 'Chacreamento Araguaia';

/** Runtime Vercel/Node que NÃO é Production (preview, development, test). */
export function isNonProductionContractRuntime(): boolean {
  const vercelEnv = String(
    process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || '',
  )
    .trim()
    .toLowerCase();
  if (vercelEnv === 'production') return false;
  if (vercelEnv === 'preview' || vercelEnv === 'development') return true;
  // Local / scripts sem VERCEL_ENV: permitir coerce para testes manuais.
  return String(process.env.NODE_ENV || '')
    .trim()
    .toLowerCase() !== 'production';
}

/**
 * Em Preview/dev, força ARAGUAIA para o empreendimento Chacreamento Araguaia
 * sem UPDATE em `projects` (banco compartilhado com Production).
 * Em Production: nunca altera o valor do banco.
 */
export function coercePreviewAraguaiaProjectModel(input: {
  projectName?: unknown;
  projectModel?: unknown;
}): unknown {
  if (!isNonProductionContractRuntime()) return input.projectModel;
  const name = String(input.projectName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (name === PREVIEW_ARAGUAIA_PROJECT_NAME.toLowerCase()) {
    return 'ARAGUAIA';
  }
  return input.projectModel;
}

export function detectPreviewAraguaiaNameCoerce(input: {
  projectName?: unknown;
  projectModel?: unknown;
}): boolean {
  const stored = parseOptionalSaleContractModel(input.projectModel);
  if (stored === 'ARAGUAIA') return false;
  const coerced = coercePreviewAraguaiaProjectModel(input);
  return parseOptionalSaleContractModel(coerced) === 'ARAGUAIA';
}

/**
 * Resolve o modelo efetivo com prioridade de snapshot e empreendimento.
 * Nunca cruza tenant: callers devem passar apenas entidades já isoladas.
 */
export function resolveSaleContractModelFromContext(input: {
  saleModel?: unknown;
  contractModel?: unknown;
  projectModel?: unknown;
  companyModel?: unknown;
  uiFallback?: unknown;
  /** Nome do empreendimento — habilita coerce Preview do Araguaia sem migration/UPDATE. */
  projectName?: unknown;
}): { model: SaleContractModel; source: SaleContractModelSource } {
  const sale = parseOptionalSaleContractModel(input.saleModel);
  if (sale) return { model: sale, source: 'sale' };

  const contract = parseOptionalSaleContractModel(input.contractModel);
  if (contract) return { model: contract, source: 'contract' };

  const project = parseOptionalSaleContractModel(
    coercePreviewAraguaiaProjectModel({
      projectName: input.projectName,
      projectModel: input.projectModel,
    }),
  );
  if (project) return { model: project, source: 'project' };

  if (
    input.companyModel != null &&
    String(input.companyModel).trim() !== ''
  ) {
    return {
      model: normalizeSaleContractModel(input.companyModel),
      source: 'company',
    };
  }

  const ui = parseOptionalSaleContractModel(input.uiFallback);
  if (ui) return { model: ui, source: 'ui' };

  return { model: 'PADRAO', source: 'fallback' };
}

/**
 * Garante que há um modelo utilizável. Com companies.contract_model DEFAULT PADRAO
 * o fallback sempre existe; bloqueia só quando não há empresa nem override válido.
 */
export function assertSaleContractModelConfigured(input: {
  saleModel?: unknown;
  contractModel?: unknown;
  projectModel?: unknown;
  companyModel?: unknown;
  uiFallback?: unknown;
  companyFound?: boolean;
  projectName?: unknown;
}): SaleContractModel {
  const effectiveProjectModel = coercePreviewAraguaiaProjectModel({
    projectName: input.projectName,
    projectModel: input.projectModel,
  });
  const hasProject = parseOptionalSaleContractModel(effectiveProjectModel) != null;
  const hasSale = parseOptionalSaleContractModel(input.saleModel) != null;
  const hasContract = parseOptionalSaleContractModel(input.contractModel) != null;
  const hasCompany =
    input.companyFound !== false &&
    input.companyModel != null &&
    String(input.companyModel).trim() !== '';
  const hasUi = parseOptionalSaleContractModel(input.uiFallback) != null;

  if (!hasSale && !hasContract && !hasProject && !hasCompany && !hasUi) {
    throw new Error(MISSING_PROJECT_CONTRACT_MODEL_MESSAGE);
  }

  return resolveSaleContractModelFromContext(input).model;
}

/** Aplica o modelo efetivo no objeto tenant usado por generateContractHTML. */
export function applyEffectiveContractModelToTenant(
  tenant: Record<string, unknown>,
  model: SaleContractModel,
): Record<string, unknown> {
  return {
    ...tenant,
    contract_model: model,
  };
}

export function isRecantoPrimaveraContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleContractModel(company) === 'RECANTO_PRIMAVERA';
}

export function isSvLotes2ContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleContractModel(company) === 'SV_LOTES_2';
}

export function isAraguaiaContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleContractModel(company) === 'ARAGUAIA';
}

/** Modelos que usam o template clássico (Meneses / Padrão SV LOTES). */
export function isClassicSaleContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  const model = resolveSaleContractModel(company);
  return model === 'PADRAO' || model === 'MENESES';
}

export {
  SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE,
  SV_LOTES_2_CERTIFICATE_TITLE,
  resolveSaleContractCertificatePublicUrl,
  resolveSaleContractCertificateQrUrl,
} from '@/lib/saleContractSignatureVerify';
