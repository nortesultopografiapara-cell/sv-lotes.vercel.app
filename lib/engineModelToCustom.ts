/**
 * Converter cópia de motor TypeScript em modelo CUSTOM editável.
 * Não altera o motor original, o seed do sistema nem generated_html de vendas.
 */
import { catalogEngineKey } from '@/lib/contractModelCentral';
import { CUSTOM_DRAFT_VERSION } from '@/lib/customContractModelEditor';
import {
  isTypeScriptEngineCode,
  type OperationalModel,
  type OperationalStore,
  type OperationalVersion,
} from '@/lib/contractModelCentralOps';
import { buildEstrelaDoSulTokenizedCustomHtml } from '@/lib/estrelaDoSulCustomTemplate';

export const ENGINE_TO_CUSTOM_SUPPORTED = ['ESTRELA_DO_SUL'] as const;

export const CONVERT_TO_CUSTOM_LABEL = 'Converter para editável';

export const CONVERT_TO_CUSTOM_CONFIRM =
  'Converter este modelo para editável?\n\nUma cópia do conteúdo atual será transformada em um modelo CUSTOM e poderá ser alterada no editor.\n\nO modelo original e o motor do sistema não serão modificados.\n\nEsta ação afetará somente este modelo.';

export const CONVERT_TO_CUSTOM_UNSUPPORTED =
  'Este modelo não pode ser convertido para editável.';

export const CONVERT_SYSTEM_SEED_BLOCKED =
  'O modelo original do sistema não pode ser convertido. Duplique-o e converta a cópia.';

export const REBUILD_ESTRELA_CUSTOM_LABEL = 'Reconstruir contrato oficial';

export const REBUILD_ESTRELA_CUSTOM_CONFIRM =
  'Substituir o rascunho pelo contrato oficial ESTRELA_DO_SUL, com campos dinâmicos ({{CLIENT_NAME}}, {{PARTNERSHIP_NOTE}}, valores da venda, etc.)?\n\nO texto jurídico segue o contrato final homologado. Os dados da venda continuam tokens e serão preenchidos na Visualização.\n\nEsta ação altera somente o rascunho deste modelo CUSTOM. O motor ESTRELA original, Production e contratos já emitidos não mudam.';

export type EngineToCustomSupported = (typeof ENGINE_TO_CUSTOM_SUPPORTED)[number];

export type EngineToCustomConversionMeta = {
  action: 'ENGINE_TO_CUSTOM';
  note: string;
  fromCatalogCode: string;
  fromEngineKey: string;
  previousPublishedVersion: number | null;
  previousEngineParamsJson: Record<string, unknown> | null;
  convertedAt: string;
  convertedBy: string | null;
  modelId: string;
};

function isSupportedEngine(code: string): code is EngineToCustomSupported {
  return (ENGINE_TO_CUSTOM_SUPPORTED as readonly string[]).includes(code);
}

export function engineToCustomHistoryNote(fromCatalogCode: string): string {
  return `Modelo convertido de ${fromCatalogCode} para CUSTOM`;
}

export function canConvertEngineModelToCustom(model: {
  source?: string;
  catalogCode?: string;
  catalog_code?: string;
  status?: string;
}): boolean {
  const source = String(model.source || '');
  const catalogCode = String(model.catalogCode || model.catalog_code || '').trim();
  if (source === 'system_seed') return false;
  if (source !== 'user') return false;
  if (!isTypeScriptEngineCode(catalogCode)) return false;
  if (!isSupportedEngine(catalogCode)) return false;
  if (model.status && model.status !== 'active') return false;
  return true;
}

export function renderEngineModelAsCustomHtml(catalogCode: string): string {
  if (catalogCode === 'ESTRELA_DO_SUL') {
    return buildEstrelaDoSulTokenizedCustomHtml();
  }
  throw new Error(CONVERT_TO_CUSTOM_UNSUPPORTED);
}

export function buildEngineToCustomParams(input: {
  modelId: string;
  fromCatalogCode: string;
  fromEngineKey: string;
  previousPublishedVersion: number | null;
  previousEngineParamsJson?: Record<string, unknown> | null;
  convertedAt: string;
  convertedBy?: string | null;
}): Record<string, unknown> {
  const meta: EngineToCustomConversionMeta = {
    action: 'ENGINE_TO_CUSTOM',
    note: engineToCustomHistoryNote(input.fromCatalogCode),
    fromCatalogCode: input.fromCatalogCode,
    fromEngineKey: input.fromEngineKey,
    previousPublishedVersion: input.previousPublishedVersion,
    previousEngineParamsJson: input.previousEngineParamsJson || null,
    convertedAt: input.convertedAt,
    convertedBy: input.convertedBy || null,
    modelId: input.modelId,
  };
  return { convertedFrom: meta };
}

function publishedRows<T extends { version: number; status?: string }>(
  versions: T[],
): T[] {
  return versions
    .filter((row) => String(row.status || '') === 'published')
    .sort((a, b) => b.version - a.version);
}

export function planEngineToCustomPersist(input: {
  modelId: string;
  catalogCode: string;
  engineKey: string;
  source: string;
  status?: string;
  publishedVersions: Array<{
    version: number;
    status: string;
    content_html?: string | null;
    engine_params_json?: unknown;
  }>;
  userId?: string | null;
  at?: string;
}): {
  html: string;
  nextVersion: number;
  params: Record<string, unknown>;
  skipPublishedInsert: boolean;
  conversion: EngineToCustomConversionMeta;
} {
  if (
    !canConvertEngineModelToCustom({
      source: input.source,
      catalogCode: input.catalogCode,
      status: input.status,
    })
  ) {
    throw new Error(
      input.source === 'system_seed'
        ? CONVERT_SYSTEM_SEED_BLOCKED
        : CONVERT_TO_CUSTOM_UNSUPPORTED,
    );
  }

  const at = input.at || new Date().toISOString();
  const published = publishedRows(input.publishedVersions);
  const latest = published[0] || null;
  const latestHtml = String(latest?.content_html || '').trim();
  const latestNote = conversionNoteFromVersion(
    latest ? { engine_params_json: latest.engine_params_json } : null,
  );
  if (latest && latestHtml && latestNote) {
    const params =
      latest.engine_params_json &&
      typeof latest.engine_params_json === 'object' &&
      !Array.isArray(latest.engine_params_json)
        ? (latest.engine_params_json as Record<string, unknown>)
        : buildEngineToCustomParams({
            modelId: input.modelId,
            fromCatalogCode: input.catalogCode,
            fromEngineKey: input.engineKey,
            previousPublishedVersion: latest.version,
            convertedAt: at,
            convertedBy: input.userId,
          });
    return {
      html: latestHtml,
      nextVersion: latest.version,
      params,
      skipPublishedInsert: true,
      conversion: (params.convertedFrom || {}) as EngineToCustomConversionMeta,
    };
  }

  const html = renderEngineModelAsCustomHtml(input.catalogCode);
  const previousParams =
    latest?.engine_params_json &&
    typeof latest.engine_params_json === 'object' &&
    !Array.isArray(latest.engine_params_json)
      ? (latest.engine_params_json as Record<string, unknown>)
      : null;
  const params = buildEngineToCustomParams({
    modelId: input.modelId,
    fromCatalogCode: input.catalogCode,
    fromEngineKey: input.engineKey,
    previousPublishedVersion: latest?.version ?? null,
    previousEngineParamsJson: previousParams,
    convertedAt: at,
    convertedBy: input.userId,
  });
  const maxVersion = published.reduce((max, row) => Math.max(max, row.version), 0);
  return {
    html,
    nextVersion: maxVersion + 1,
    params,
    skipPublishedInsert: false,
    conversion: params.convertedFrom as EngineToCustomConversionMeta,
  };
}

export function conversionNoteFromVersion(
  version: Pick<OperationalVersion, 'engineParamsJson'> | { engine_params_json?: unknown } | null,
): string | null {
  const raw =
    (version as OperationalVersion | null)?.engineParamsJson ??
    (version as { engine_params_json?: unknown } | null)?.engine_params_json;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const converted = (raw as { convertedFrom?: { note?: string } }).convertedFrom;
  const note = String(converted?.note || '').trim();
  return note || null;
}

export function convertedFromCatalogCode(
  version: Pick<OperationalVersion, 'engineParamsJson'> | { engine_params_json?: unknown } | null,
): string {
  const raw =
    (version as OperationalVersion | null)?.engineParamsJson ??
    (version as { engine_params_json?: unknown } | null)?.engine_params_json;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const converted = (raw as { convertedFrom?: { fromCatalogCode?: string } }).convertedFrom;
  return String(converted?.fromCatalogCode || '').trim();
}

export function canRebuildEstrelaConvertedCustom(input: {
  catalogCode?: string;
  catalog_code?: string;
  versions?: Array<{ engine_params_json?: unknown; engineParamsJson?: unknown }>;
}): boolean {
  const catalog = String(input.catalogCode || input.catalog_code || '').trim();
  if (catalog !== 'CUSTOM') return false;
  return (input.versions || []).some(
    (row) => convertedFromCatalogCode(row) === 'ESTRELA_DO_SUL',
  );
}

export function convertEngineModelToCustom(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  input?: { userId?: string | null; at?: string },
): {
  store: OperationalStore;
  model: OperationalModel;
  html: string;
  conversion: EngineToCustomConversionMeta;
} {
  const model = store.models.find((row) => row.id === modelId);
  if (!model) throw new Error('Modelo não encontrado.');
  if (model.companyId !== callerCompanyId) {
    throw new Error('Modelo de contrato pertence a outra empresa.');
  }
  if (model.source === 'system_seed') {
    throw new Error(CONVERT_SYSTEM_SEED_BLOCKED);
  }
  if (!canConvertEngineModelToCustom(model)) {
    throw new Error(CONVERT_TO_CUSTOM_UNSUPPORTED);
  }

  const at = input?.at || new Date().toISOString();
  const plan = planEngineToCustomPersist({
    modelId: model.id,
    catalogCode: model.catalogCode,
    engineKey: model.engineKey,
    source: model.source,
    status: model.status,
    publishedVersions: store.versions
      .filter((row) => row.modelId === modelId)
      .map((row) => ({
        version: row.version,
        status: row.status,
        content_html: row.contentHtml,
        engine_params_json: row.engineParamsJson,
      })),
    userId: input?.userId || null,
    at,
  });
  const html = plan.html;
  const params = plan.params;
  const conversion = plan.conversion;

  model.catalogCode = 'CUSTOM';
  model.engineKey = catalogEngineKey('CUSTOM');
  model.updatedAt = at;

  if (!plan.skipPublishedInsert) {
    store.versions.push({
      id: `conv-${modelId}-${plan.nextVersion}`,
      modelId,
      companyId: callerCompanyId,
      version: plan.nextVersion,
      status: 'published',
      contentHtml: html,
      engineParamsJson: params,
      createdAt: at,
      publishedAt: at,
    });
  }

  const existingDraft = store.versions.find(
    (row) =>
      row.modelId === modelId &&
      row.status === 'draft' &&
      row.version === CUSTOM_DRAFT_VERSION,
  );
  if (existingDraft) {
    existingDraft.contentHtml = html;
    existingDraft.engineParamsJson = params;
    existingDraft.updatedAt = at;
  } else {
    store.versions.push({
      id: `draft-${modelId}`,
      modelId,
      companyId: callerCompanyId,
      version: CUSTOM_DRAFT_VERSION,
      status: 'draft',
      contentHtml: html,
      engineParamsJson: params,
      createdAt: at,
      updatedAt: at,
    });
  }

  return { store, model, html, conversion };
}
