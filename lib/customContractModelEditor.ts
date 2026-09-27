/**
 * Regras do Editor CUSTOM A4.
 * Não chama generateContractHTML, GIS, financeiro nem assinatura.
 */
import { canonicalizeCustomContractHtml } from '@/lib/customContractHtml';
import { DEFAULT_CUSTOM_CONTRACT_HTML } from '@/lib/customContractPlaceholders';
import {
  isCustomCatalogCode,
  isTypeScriptEngineCode,
  type OperationalStore,
  type OperationalVersion,
} from '@/lib/contractModelCentralOps';

export const CUSTOM_CONTRACT_EDITOR_PATH = (modelId: string) =>
  `/contracts/models/${encodeURIComponent(modelId)}/editor`;

export const CUSTOM_EDITOR_ONLY =
  'O editor A4 está disponível somente para modelos personalizados.';

export const NO_CHANGE_SINCE_PUBLISHED =
  'Nenhuma alteração desde a última versão publicada.';

export const IMPORT_TEXT_HTML_ONLY =
  'Nesta etapa, importe apenas texto ou HTML. PDF e DOCX ainda não são convertidos.';

export const CUSTOM_DRAFT_VERSION = 0;

export function assertCustomEditorAllowed(catalogCode: string): void {
  if (isTypeScriptEngineCode(catalogCode) || !isCustomCatalogCode(catalogCode)) {
    throw new Error(CUSTOM_EDITOR_ONLY);
  }
}

export function canOpenCustomA4Editor(catalogCode: string): boolean {
  return isCustomCatalogCode(catalogCode);
}

export function latestPublishedVersion(
  versions: Array<Pick<OperationalVersion, 'modelId' | 'status' | 'version' | 'contentHtml'>>,
  modelId: string,
): Pick<OperationalVersion, 'version' | 'contentHtml' | 'status'> | null {
  const published = versions
    .filter((row) => row.modelId === modelId && row.status === 'published')
    .sort((a, b) => b.version - a.version);
  return published[0] || null;
}

export function findDraftVersion(
  versions: Array<Pick<OperationalVersion, 'modelId' | 'status' | 'version' | 'contentHtml' | 'id' | 'engineParamsJson'>>,
  modelId: string,
) {
  return (
    versions.find(
      (row) =>
        row.modelId === modelId && row.status === 'draft' && row.version === CUSTOM_DRAFT_VERSION,
    ) || null
  );
}

export function nextPublishedVersionNumber(
  versions: Array<Pick<OperationalVersion, 'modelId' | 'status' | 'version'>>,
  modelId: string,
): number {
  const published = versions
    .filter((row) => row.modelId === modelId && row.status === 'published')
    .map((row) => row.version);
  const max = published.length ? Math.max(...published) : 0;
  return max + 1;
}

export function canPublishCustomDraft(
  draftHtml: string | null | undefined,
  lastPublishedHtml: string | null | undefined,
): { ok: boolean; reason?: string } {
  const draftCanon = canonicalizeCustomContractHtml(String(draftHtml || ''));
  if (!draftCanon) {
    return { ok: false, reason: 'O rascunho está vazio.' };
  }
  if (lastPublishedHtml == null || String(lastPublishedHtml).trim() === '') {
    return { ok: true };
  }
  const publishedCanon = canonicalizeCustomContractHtml(String(lastPublishedHtml || ''));
  if (draftCanon === publishedCanon) {
    return { ok: false, reason: NO_CHANGE_SINCE_PUBLISHED };
  }
  return { ok: true };
}

export function simulateEnsureCustomDraft(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalVersion {
  const model = store.models.find((m) => m.id === modelId);
  if (!model) throw new Error('Modelo não encontrado.');
  if (model.companyId !== callerCompanyId) throw new Error('Modelo de contrato pertence a outra empresa.');
  assertCustomEditorAllowed(model.catalogCode);
  const existing = findDraftVersion(store.versions, modelId);
  if (existing) return existing as OperationalVersion;
  const published = latestPublishedVersion(store.versions, modelId);
  const draft: OperationalVersion = {
    id: `draft-${modelId}`,
    modelId,
    companyId: callerCompanyId,
    version: CUSTOM_DRAFT_VERSION,
    status: 'draft',
    contentHtml: published?.contentHtml ?? DEFAULT_CUSTOM_CONTRACT_HTML,
    createdAt: at,
  };
  store.versions.push(draft);
  return draft;
}

export function simulatePublishCustomDraft(
  store: OperationalStore,
  modelId: string,
  callerCompanyId: string,
  at = new Date().toISOString(),
): OperationalVersion {
  const model = store.models.find((m) => m.id === modelId);
  if (!model) throw new Error('Modelo não encontrado.');
  if (model.companyId !== callerCompanyId) throw new Error('Modelo de contrato pertence a outra empresa.');
  assertCustomEditorAllowed(model.catalogCode);
  const draft = findDraftVersion(store.versions, modelId);
  if (!draft) throw new Error('Não há rascunho para publicar');
  const last = latestPublishedVersion(store.versions, modelId);
  const gate = canPublishCustomDraft(draft.contentHtml, last?.contentHtml);
  if (!gate.ok) throw new Error(gate.reason);
  const published: OperationalVersion = {
    id: `pub-${modelId}-${nextPublishedVersionNumber(store.versions, modelId)}`,
    modelId,
    companyId: callerCompanyId,
    version: nextPublishedVersionNumber(store.versions, modelId),
    status: 'published',
    contentHtml: draft.contentHtml,
    engineParamsJson: draft.engineParamsJson ?? null,
    createdAt: at,
  };
  store.versions.push(published);
  const stillDraft = findDraftVersion(store.versions, modelId);
  if (!stillDraft || stillDraft.status !== 'draft' || stillDraft.version !== CUSTOM_DRAFT_VERSION) {
    throw new Error('Publicar não pode alterar o rascunho.');
  }
  return published;
}

export function defaultCustomDraftHtml(existing?: string | null): string {
  const current = String(existing || '').trim();
  return current || DEFAULT_CUSTOM_CONTRACT_HTML;
}

export function shouldAutosavePublish(): boolean {
  return false;
}
