/**
 * Central de Modelos de Contrato — Etapa 1.
 * Compatível com lib/contractModel.ts. Sem mudança perceptível na geração
 * enquanto os FKs novos estiverem nulos/ausentes.
 */

import {
  normalizeSaleContractModel,
  parseOptionalSaleContractModel,
  resolveSaleContractModelFromContext,
  SALE_CONTRACT_MODEL_LABELS,
  type SaleContractModel,
  type SaleContractModelSource,
} from '@/lib/contractModel';

export const CONTRACT_MODELS_CENTRAL_PATH = '/contracts/models';

export const CONTRACT_MODEL_CATALOG_SEED = [
  { code: 'PADRAO' as const, label: SALE_CONTRACT_MODEL_LABELS.PADRAO, engineKey: 'classic', isSystemDefault: true, sortOrder: 10 },
  { code: 'MENESES' as const, label: SALE_CONTRACT_MODEL_LABELS.MENESES, engineKey: 'classic_meneses', isSystemDefault: false, sortOrder: 20 },
  { code: 'SV_LOTES_2' as const, label: SALE_CONTRACT_MODEL_LABELS.SV_LOTES_2, engineKey: 'sv_lotes_2', isSystemDefault: false, sortOrder: 30 },
  { code: 'RECANTO_PRIMAVERA' as const, label: SALE_CONTRACT_MODEL_LABELS.RECANTO_PRIMAVERA, engineKey: 'recanto_primavera', isSystemDefault: false, sortOrder: 40 },
  { code: 'ARAGUAIA' as const, label: SALE_CONTRACT_MODEL_LABELS.ARAGUAIA, engineKey: 'araguaia', isSystemDefault: false, sortOrder: 50 },
  { code: 'MUNDO_NOVO' as const, label: SALE_CONTRACT_MODEL_LABELS.MUNDO_NOVO, engineKey: 'mundo_novo', isSystemDefault: false, sortOrder: 60 },
  { code: 'ESTRELA_DO_SUL' as const, label: SALE_CONTRACT_MODEL_LABELS.ESTRELA_DO_SUL, engineKey: 'estrela_do_sul', isSystemDefault: false, sortOrder: 70 },
  { code: 'CUSTOM' as const, label: SALE_CONTRACT_MODEL_LABELS.CUSTOM, engineKey: 'custom', isSystemDefault: false, sortOrder: 90 },
] as const;

export const SYSTEM_CONTRACT_MODEL_CODES: SaleContractModel[] =
  CONTRACT_MODEL_CATALOG_SEED.filter((row) => row.code !== 'CUSTOM').map(
    (row) => row.code,
  );

export type CompanyContractModelStatus = 'active' | 'archived';
export type CompanyContractModelSource = 'system_seed' | 'legacy_template' | 'user';

export type CompanyContractModelRecord = {
  id: string;
  companyId: string;
  catalogCode: SaleContractModel;
  engineKey: string;
  name: string;
  status: CompanyContractModelStatus;
  source: CompanyContractModelSource;
  isCompanyDefault: boolean;
  publishedVersion: number | null;
  projectNames: string[];
};

export function catalogEngineKey(code: SaleContractModel): string {
  return (
    CONTRACT_MODEL_CATALOG_SEED.find((row) => row.code === code)?.engineKey ??
    'classic'
  );
}

export function assertTenantOwnsContractModel(input: {
  modelCompanyId: string | null | undefined;
  callerCompanyId: string | null | undefined;
}): void {
  const modelCompanyId = String(input.modelCompanyId ?? '').trim();
  const callerCompanyId = String(input.callerCompanyId ?? '').trim();
  if (!modelCompanyId || !callerCompanyId || modelCompanyId !== callerCompanyId) {
    throw new Error('Modelo de contrato pertence a outra empresa.');
  }
}

export function canUseContractModelInTenant(input: {
  modelCompanyId: string | null | undefined;
  callerCompanyId: string | null | undefined;
}): boolean {
  try {
    assertTenantOwnsContractModel(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolução preparado para a Central:
 *   snapshot venda/contrato (texto atual) → padrão do empreendimento (FK)
 *   → padrão da empresa (FK) → campos texto atuais → PADRAO
 *
 * Se os FKs novos estiverem nulos/indisponíveis, o resultado é idêntico
 * a resolveSaleContractModelFromContext (zero mudança perceptível).
 */
export function resolveCompatibleSaleContractModel(input: {
  saleModel?: unknown;
  contractModel?: unknown;
  projectModel?: unknown;
  companyModel?: unknown;
  uiFallback?: unknown;
  projectName?: unknown;
  projectDefaultCatalogCode?: unknown;
  companyDefaultCatalogCode?: unknown;
  modelCompanyId?: unknown;
  callerCompanyId?: unknown;
}): { model: SaleContractModel; source: SaleContractModelSource | 'central_project' | 'central_company' } {
  if (
    input.modelCompanyId != null &&
    String(input.modelCompanyId).trim() !== '' &&
    input.callerCompanyId != null &&
    String(input.callerCompanyId).trim() !== ''
  ) {
    assertTenantOwnsContractModel({
      modelCompanyId: String(input.modelCompanyId),
      callerCompanyId: String(input.callerCompanyId),
    });
  }

  const sale = parseOptionalSaleContractModel(input.saleModel);
  if (sale) {
    return resolveSaleContractModelFromContext(input);
  }
  const contract = parseOptionalSaleContractModel(input.contractModel);
  if (contract) {
    return resolveSaleContractModelFromContext(input);
  }

  const centralProject = parseOptionalSaleContractModel(
    input.projectDefaultCatalogCode,
  );
  if (centralProject) {
    return { model: centralProject, source: 'central_project' };
  }

  const centralCompany = parseOptionalSaleContractModel(
    input.companyDefaultCatalogCode,
  );
  if (centralCompany) {
    return { model: centralCompany, source: 'central_company' };
  }

  return resolveSaleContractModelFromContext(input);
}

export type SeedCompanyInput = {
  id: string;
  contract_model?: unknown;
};

export type SeedProjectInput = {
  id: string;
  company_id?: string | null;
  tenant_id?: string | null;
  contract_model?: unknown;
  name?: string | null;
};

export type SeedTemplateInput = {
  id: string;
  tenant_id: string;
  name?: string | null;
  content?: string | null;
};

export type SimulatedCompanyModel = {
  id: string;
  companyId: string;
  catalogCode: SaleContractModel;
  name: string;
  source: CompanyContractModelSource;
  isCompanyDefault: boolean;
  status: CompanyContractModelStatus;
  sourceTemplateId?: string;
  publishedVersion: number;
  contentHtml: string | null;
};

export type SimulatedProjectLink = {
  projectId: string;
  companyId: string;
  catalogCode: SaleContractModel;
  isProjectDefault: boolean;
};

export function simulateContractModelCentralSeed(input: {
  companies: SeedCompanyInput[];
  projects?: SeedProjectInput[];
  templates?: SeedTemplateInput[];
}): {
  models: SimulatedCompanyModel[];
  links: SimulatedProjectLink[];
  historicalContractHtmlTouched: boolean;
} {
  const models: SimulatedCompanyModel[] = [];
  let seq = 0;
  const nextId = () => `m${++seq}`;

  for (const company of input.companies) {
    const defaultCode = normalizeSaleContractModel(company.contract_model);
    for (const cat of CONTRACT_MODEL_CATALOG_SEED) {
      if (cat.code === 'CUSTOM') continue;
      models.push({
        id: nextId(),
        companyId: company.id,
        catalogCode: cat.code,
        name: cat.label,
        source: 'system_seed',
        isCompanyDefault: defaultCode === cat.code,
        status: 'active',
        publishedVersion: 1,
        contentHtml: null,
      });
    }
  }

  for (const template of input.templates ?? []) {
    const company = input.companies.find((c) => c.id === template.tenant_id);
    if (!company) continue;
    const alreadyDefault = models.some(
      (m) => m.companyId === company.id && m.isCompanyDefault,
    );
    const companyIsCustom =
      normalizeSaleContractModel(company.contract_model) === 'CUSTOM';
    models.push({
      id: nextId(),
      companyId: company.id,
      catalogCode: 'CUSTOM',
      name: String(template.name || 'Modelo personalizado').trim() || 'Modelo personalizado',
      source: 'legacy_template',
      isCompanyDefault: companyIsCustom && !alreadyDefault,
      status: 'active',
      sourceTemplateId: template.id,
      publishedVersion: 1,
      contentHtml: template.content ?? null,
    });
  }

  const links: SimulatedProjectLink[] = [];
  for (const project of input.projects ?? []) {
    const raw = String(project.contract_model ?? '').trim();
    if (!raw) continue;
    const companyId = project.company_id || project.tenant_id || '';
    if (!companyId) continue;
    const code = normalizeSaleContractModel(raw);
    const model = models.find(
      (m) =>
        m.companyId === companyId &&
        m.catalogCode === code &&
        m.source === 'system_seed',
    );
    if (!model) continue;
    links.push({
      projectId: project.id,
      companyId,
      catalogCode: code,
      isProjectDefault: true,
    });
  }

  return {
    models,
    links,
    historicalContractHtmlTouched: false,
  };
}

export function pickPublishedVersionNumber(
  versions: Array<{ status?: string; version?: number }>,
): number | null {
  const published = versions
    .filter((row) => row.status === 'published')
    .map((row) => Number(row.version))
    .filter((n) => Number.isFinite(n) && n >= 1);
  if (published.length === 0) return null;
  return Math.max(...published);
}
