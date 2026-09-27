/**
 * Regras da Central operacional (Etapa 1).
 * Não grava companies.contract_model / projects.contract_model.
 * Não altera generated_html nem motores TypeScript.
 */
import {
  SYSTEM_CONTRACT_MODEL_CODES,
  assertTenantOwnsContractModel,
  catalogEngineKey,
  type CompanyContractModelSource,
  type CompanyContractModelStatus,
} from '@/lib/contractModelCentral';
import type { SaleContractModel } from '@/lib/contractModel';

export const CUSTOM_NOT_IN_AUTO_EMISSION =
  'Este modelo ainda não está vinculado à emissão automática.';

export const LEGAL_TEXT_LOCKED =
  'O texto deste contrato é gerado automaticamente e não pode ser editado aqui.';

export const ARCHIVE_DEFAULT_BLOCKED =
  'Defina outro modelo como padrão da empresa antes de arquivar este.';

export const SYSTEM_SEED_DELETE_BLOCKED =
  'Modelos de origem do sistema não podem ser excluídos.';

/** Colunas reais da migration — versions/links NÃO têm tenant_id. */
export const CENTRAL_TABLE_COLUMNS = {
  company_contract_models: [
    'id',
    'company_id',
    'tenant_id',
    'catalog_code',
    'engine_key',
    'name',
    'status',
    'source',
    'is_company_default',
    'source_template_id',
    'created_at',
    'updated_at',
  ],
  company_contract_model_versions: [
    'id',
    'model_id',
    'company_id',
    'version',
    'status',
    'content_html',
    'engine_params_json',
    'created_at',
    'created_by',
  ],
  project_contract_model_links: [
    'id',
    'project_id',
    'company_id',
    'company_contract_model_id',
    'is_project_default',
    'created_at',
  ],
} as const;

export type CentralWriteTable = keyof typeof CENTRAL_TABLE_COLUMNS;

export function payloadForCentralTable(
  table: CentralWriteTable,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(CENTRAL_TABLE_COLUMNS[table] as readonly string[]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.has(key) || value === undefined) continue;
    out[key] = value;
  }
  if (table !== 'company_contract_models' && 'tenant_id' in out) {
    delete out.tenant_id;
  }
  return out;
}

export function companyDefaultUpdatePayload(now: string, isDefault: boolean) {
  return {
    is_company_default: isDefault,
    ...(isDefault ? { status: 'active' as const } : {}),
    updated_at: now,
  };
}

export type OperationalModel = {
  id: string;
  companyId: string;
  catalogCode: SaleContractModel;
  engineKey: string;
  name: string;
  status: CompanyContractModelStatus;
  source: CompanyContractModelSource;
  isCompanyDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OperationalVersion = {
  id: string;
  modelId: string;
  companyId: string;
  version: number;
  status: 'draft' | 'published';
  contentHtml: string | null;
  engineParamsJson?: Record<string, unknown> | null;
  createdAt: string;
};

export type OperationalLink = {
  id: string;
  projectId: string;
  companyId: string;
  modelId: string;
  isProjectDefault: boolean;
  projectName: string;
};

export type OperationalStore = {
  models: OperationalModel[];
  versions: OperationalVersion[];
  links: OperationalLink[];
  /** Espelho do cadastro GIS — esta fatia nunca altera. */
  companiesContractModel: Record<string, string>;
  projectsContractModel: Record<string, string | null>;
  generatedHtmlByContractId: Record<string, string>;
};

export function isTypeScriptEngineCode(code: string): boolean {
  return (SYSTEM_CONTRACT_MODEL_CODES as string[]).includes(code);
}

export function isCustomCatalogCode(code: string): boolean {
  return code === 'CUSTOM';
}

export function legalContentIsLocked(catalogCode: string): boolean {
  return isTypeScriptEngineCode(catalogCode);
}

export function showsAutoEmissionPending(catalogCode: string, source: string): boolean {
  return isCustomCatalogCode(catalogCode) || source === 'legacy_template';
}

export function physicalDeleteAllowed(): boolean {
  return false;
}

export function isSystemSeedSource(source: string): boolean {
  return source === 'system_seed';
}

export function nextCopyName(baseName: string, existingNames: string[]): string {
  const trimmed = String(baseName || '').trim() || 'Modelo';
  const names = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const first = `Cópia de ${trimmed}`;
  if (!names.has(first.toLowerCase())) return first;
  let n = 2;
  while (names.has(`cópia de ${trimmed} (${n})`.toLowerCase())) n += 1;
  return `Cópia de ${trimmed} (${n})`;
}

export function assertSameTenant(input: {
  modelCompanyId: string;
  callerCompanyId: string;
  extraCompanyId?: string | null;
}): void {
  assertTenantOwnsContractModel({
    modelCompanyId: input.modelCompanyId,
    callerCompanyId: input.callerCompanyId,
  });
  if (input.extraCompanyId != null && String(input.extraCompanyId).trim() !== '') {
    assertTenantOwnsContractModel({
      modelCompanyId: input.extraCompanyId,
      callerCompanyId: input.callerCompanyId,
    });
  }
}

function requireModel(
  store: OperationalStore,
  id: string,
  callerCompanyId: string,
): OperationalModel {
  const model = store.models.find((m) => m.id === id);
  if (!model) throw new Error('Modelo não encontrado.');
  assertSameTenant({ modelCompanyId: model.companyId, callerCompanyId });
  return model;
}

function touch(model: OperationalModel, at: string) {
  model.updatedAt = at;
}

function uniqueId(prefix: string, store: OperationalStore): string {
  return `${prefix}-${store.models.length + store.versions.length + store.links.length + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

export function activeCompanyDefault(store: OperationalStore, companyId: string): OperationalModel | null {
  return (
    store.models.find(
      (m) =>
        m.companyId === companyId &&
        m.isCompanyDefault &&
        m.status === 'active',
    ) || null
  );
}

export function countActiveCompanyDefaults(store: OperationalStore, companyId: string): number {
  return store.models.filter(
    (m) => m.companyId === companyId && m.isCompanyDefault && m.status === 'active',
  ).length;
}

export function countProjectDefaults(store: OperationalStore, projectId: string): number {
  return store.links.filter((l) => l.projectId === projectId && l.isProjectDefault).length;
}

export function canArchiveModel(store: OperationalStore, modelId: string, callerCompanyId: string): {
  ok: boolean;
  reason?: string;
} {
  const model = requireModel(store, modelId, callerCompanyId);
  if (model.isCompanyDefault && model.status === 'active') {
    return { ok: false, reason: ARCHIVE_DEFAULT_BLOCKED };
  }
  return { ok: true };
}

export function renameModel(
  store: OperationalStore,
  modelId: string,
  name: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalStore {
  const model = requireModel(store, modelId, callerCompanyId);
  const next = String(name || '').trim();
  if (!next) throw new Error('Informe o nome do modelo.');
  model.name = next;
  touch(model, at);
  return store;
}

export function setCompanyDefaultAtomic(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalStore {
  const model = requireModel(store, modelId, callerCompanyId);
  if (model.status !== 'active') {
    throw new Error('Só um modelo ativo pode ser o padrão da empresa.');
  }
  for (const row of store.models) {
    if (row.companyId === callerCompanyId && row.isCompanyDefault) {
      row.isCompanyDefault = false;
      touch(row, at);
    }
  }
  model.isCompanyDefault = true;
  touch(model, at);
  if (countActiveCompanyDefaults(store, callerCompanyId) !== 1) {
    throw new Error('A empresa precisa ter exatamente um modelo padrão ativo.');
  }
  return store;
}

export function archiveModel(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalStore {
  const gate = canArchiveModel(store, modelId, callerCompanyId);
  if (!gate.ok) throw new Error(gate.reason);
  const model = requireModel(store, modelId, callerCompanyId);
  model.status = 'archived';
  model.isCompanyDefault = false;
  touch(model, at);
  for (const link of store.links) {
    if (link.modelId === modelId && link.isProjectDefault) {
      link.isProjectDefault = false;
    }
  }
  return store;
}

export function unarchiveModel(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalStore {
  const model = requireModel(store, modelId, callerCompanyId);
  model.status = 'active';
  touch(model, at);
  return store;
}

function publishedVersion(store: OperationalStore, modelId: string): OperationalVersion | null {
  const published = store.versions
    .filter((v) => v.modelId === modelId && v.status === 'published')
    .sort((a, b) => b.version - a.version);
  return published[0] || null;
}

function cloneModelRow(
  store: OperationalStore,
  source: OperationalModel,
  name: string,
  callerCompanyId: string,
  at: string,
): OperationalModel {
  assertSameTenant({ modelCompanyId: source.companyId, callerCompanyId });
  const copy: OperationalModel = {
    id: uniqueId('mdl', store),
    companyId: callerCompanyId,
    catalogCode: source.catalogCode,
    engineKey: source.engineKey,
    name,
    status: 'active',
    source: 'user',
    isCompanyDefault: false,
    createdAt: at,
    updatedAt: at,
  };
  store.models.push(copy);
  const pub = publishedVersion(store, source.id);
  store.versions.push({
    id: uniqueId('ver', store),
    modelId: copy.id,
    companyId: callerCompanyId,
    version: 1,
    status: 'published',
    contentHtml: isCustomCatalogCode(source.catalogCode) ? pub?.contentHtml ?? null : null,
    engineParamsJson: pub?.engineParamsJson ?? null,
    createdAt: at,
  });
  return copy;
}

export function duplicateModel(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): { store: OperationalStore; copy: OperationalModel } {
  const source = requireModel(store, modelId, callerCompanyId);
  const names = store.models.filter((m) => m.companyId === callerCompanyId).map((m) => m.name);
  const copy = cloneModelRow(store, source, nextCopyName(source.name, names), callerCompanyId, at);
  return { store, copy };
}

export function saveAsNewModel(
  store: OperationalStore,
  modelId: string,
  name: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): { store: OperationalStore; copy: OperationalModel } {
  const source = requireModel(store, modelId, callerCompanyId);
  const next = String(name || '').trim();
  if (!next) throw new Error('Informe o nome do novo modelo.');
  const copy = cloneModelRow(store, source, next, callerCompanyId, at);
  return { store, copy };
}

export function associateProject(
  store: OperationalStore,
  input: {
    modelId: string;
    projectId: string;
    projectName: string;
    projectCompanyId: string;
    callerCompanyId: string;
    asProjectDefault: boolean;
  },
): OperationalStore {
  const model = requireModel(store, input.modelId, input.callerCompanyId);
  assertSameTenant({
    modelCompanyId: model.companyId,
    callerCompanyId: input.callerCompanyId,
    extraCompanyId: input.projectCompanyId,
  });
  let link = store.links.find(
    (l) => l.modelId === input.modelId && l.projectId === input.projectId,
  );
  if (!link) {
    link = {
      id: uniqueId('lnk', store),
      projectId: input.projectId,
      companyId: input.callerCompanyId,
      modelId: input.modelId,
      isProjectDefault: false,
      projectName: input.projectName,
    };
    store.links.push(link);
  }
  if (input.asProjectDefault) {
    for (const row of store.links) {
      if (row.projectId === input.projectId && row.isProjectDefault) {
        row.isProjectDefault = false;
      }
    }
    link.isProjectDefault = true;
  }
  if (countProjectDefaults(store, input.projectId) > 1) {
    throw new Error('Cada empreendimento pode ter apenas um modelo padrão.');
  }
  return store;
}

export function setProjectDefaultAtomic(
  store: OperationalStore,
  input: {
    modelId: string;
    projectId: string;
    projectName: string;
    projectCompanyId: string;
    callerCompanyId: string;
  },
): OperationalStore {
  return associateProject(store, { ...input, asProjectDefault: true });
}

export function detachProject(
  store: OperationalStore,
  modelId: string,
  projectId: string,
  callerCompanyId: string,
): OperationalStore {
  requireModel(store, modelId, callerCompanyId);
  store.links = store.links.filter(
    (l) => !(l.modelId === modelId && l.projectId === projectId && l.companyId === callerCompanyId),
  );
  return store;
}

export function createNewModel(
  store: OperationalStore,
  input: {
    callerCompanyId: string;
    name: string;
    basedOnModelId?: string | null;
    personalized?: boolean;
    makeCompanyDefault?: boolean;
    project?: {
      projectId: string;
      projectName: string;
      projectCompanyId: string;
      asProjectDefault?: boolean;
    } | null;
  },
  at = new Date().toISOString(),
): { store: OperationalStore; model: OperationalModel } {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Informe o nome do modelo.');
  let catalogCode: SaleContractModel = 'CUSTOM';
  let engineKey = 'custom';
  if (input.basedOnModelId) {
    const base = requireModel(store, input.basedOnModelId, input.callerCompanyId);
    catalogCode = base.catalogCode;
    engineKey = base.engineKey;
  } else if (!input.personalized) {
    throw new Error('Escolha um modelo de origem ou Personalizado.');
  } else {
    catalogCode = 'CUSTOM';
    engineKey = catalogEngineKey('CUSTOM');
  }

  const model: OperationalModel = {
    id: uniqueId('mdl', store),
    companyId: input.callerCompanyId,
    catalogCode,
    engineKey,
    name,
    status: 'active',
    source: 'user',
    isCompanyDefault: false,
    createdAt: at,
    updatedAt: at,
  };
  store.models.push(model);
  const baseHtml =
    input.basedOnModelId && isCustomCatalogCode(catalogCode)
      ? publishedVersion(store, input.basedOnModelId)?.contentHtml ?? null
      : null;
  store.versions.push({
    id: uniqueId('ver', store),
    modelId: model.id,
    companyId: input.callerCompanyId,
    version: 1,
    status: 'published',
    contentHtml: isCustomCatalogCode(catalogCode) ? baseHtml : null,
    createdAt: at,
  });
  if (input.makeCompanyDefault) {
    setCompanyDefaultAtomic(store, model.id, input.callerCompanyId, at);
  }
  if (input.project) {
    associateProject(store, {
      modelId: model.id,
      projectId: input.project.projectId,
      projectName: input.project.projectName,
      projectCompanyId: input.project.projectCompanyId,
      callerCompanyId: input.callerCompanyId,
      asProjectDefault: input.project.asProjectDefault === true,
    });
  }
  return { store, model };
}

export function importCustomModel(
  store: OperationalStore,
  input: {
    callerCompanyId: string;
    name: string;
    fileName?: string | null;
    mime?: string | null;
    pastedHtml?: string | null;
  },
  at = new Date().toISOString(),
): { store: OperationalStore; model: OperationalModel } {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Informe o nome do modelo.');
  const model: OperationalModel = {
    id: uniqueId('mdl', store),
    companyId: input.callerCompanyId,
    catalogCode: 'CUSTOM',
    engineKey: 'custom',
    name,
    status: 'active',
    source: 'user',
    isCompanyDefault: false,
    createdAt: at,
    updatedAt: at,
  };
  store.models.push(model);
  const pasted = String(input.pastedHtml || '').trim();
  store.versions.push({
    id: uniqueId('ver', store),
    modelId: model.id,
    companyId: input.callerCompanyId,
    version: 1,
    status: 'published',
    contentHtml: pasted || null,
    engineParamsJson: {
      import: {
        fileName: input.fileName || null,
        mime: input.mime || null,
        conversion: 'pending',
      },
    },
    createdAt: at,
  });
  return { store, model };
}

export function assertStoreDidNotTouchGisFields(before: OperationalStore, after: OperationalStore): void {
  if (JSON.stringify(before.companiesContractModel) !== JSON.stringify(after.companiesContractModel)) {
    throw new Error('companies.contract_model foi alterado.');
  }
  if (JSON.stringify(before.projectsContractModel) !== JSON.stringify(after.projectsContractModel)) {
    throw new Error('projects.contract_model foi alterado.');
  }
  if (JSON.stringify(before.generatedHtmlByContractId) !== JSON.stringify(after.generatedHtmlByContractId)) {
    throw new Error('generated_html foi alterado.');
  }
}

export function snapshotGisFields(store: OperationalStore): Pick<
  OperationalStore,
  'companiesContractModel' | 'projectsContractModel' | 'generatedHtmlByContractId'
> {
  return {
    companiesContractModel: { ...store.companiesContractModel },
    projectsContractModel: { ...store.projectsContractModel },
    generatedHtmlByContractId: { ...store.generatedHtmlByContractId },
  };
}

export function cloneStore(store: OperationalStore): OperationalStore {
  return {
    models: store.models.map((m) => ({ ...m })),
    versions: store.versions.map((v) => ({ ...v, engineParamsJson: v.engineParamsJson ? { ...v.engineParamsJson } : null })),
    links: store.links.map((l) => ({ ...l })),
    companiesContractModel: { ...store.companiesContractModel },
    projectsContractModel: { ...store.projectsContractModel },
    generatedHtmlByContractId: { ...store.generatedHtmlByContractId },
  };
}

export function historyForModel(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
): OperationalVersion[] {
  requireModel(store, modelId, callerCompanyId);
  return store.versions
    .filter((v) => v.modelId === modelId && v.companyId === callerCompanyId)
    .sort((a, b) => b.version - a.version);
}
