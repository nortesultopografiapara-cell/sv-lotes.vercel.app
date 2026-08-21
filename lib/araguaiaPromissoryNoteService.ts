/**
 * Nota Promissória ARAGUAIA — orquestração (status, geração, download, versionamento).
 * Persistência: sale_documents (SYSTEM_GENERATED / PROMISSORY_NOTE) + bucket sale-documents.
 * Sem migration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PROMISSORY_NOTE_DOCUMENT_TYPE,
  PROMISSORY_NOTE_LEGAL_NUMBER,
  PROMISSORY_NOTE_SOURCE,
  buildPromissoryNoteDraft,
  buildPromissoryNoteHtml,
  isPromissoryNoteAraguaiaModel,
  isPromissoryNoteEmitted,
  parsePromissoryNoteDescription,
  resolvePromissoryNoteEligibility,
  serializePromissoryNoteDescription,
  type PromissoryNoteArtifactMetadata,
  type PromissoryNoteDraft,
  type PromissoryNoteEligibility,
  type PromissoryNoteReceiptRef,
} from '@/lib/araguaiaPromissoryNote';
import {
  buildPromissoryNoteFilename,
  buildPromissoryNotePdfBytes,
} from '@/lib/araguaiaPromissoryNotePdf';
import {
  loadFreshRegenerationEntities,
  loadSaleContractContext,
  type RegenerationSession,
} from '@/lib/contractRegeneration';
import {
  assertSaleDocumentSaleAccess,
  buildUploadStoragePathForSale,
  createSaleDocumentSignedUrl,
  createSystemGeneratedSaleDocumentMetadata,
  listSaleDocuments,
  SaleDocumentError,
  updateSaleDocumentDescription,
  type SaleDocumentRow,
} from '@/lib/saleDocumentService';
import { SALE_DOCUMENTS_STORAGE_BUCKET } from '@/lib/saleDocuments';
import { resolveCallerProfile } from '@/lib/supabase/server';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export class PromissoryNoteError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'PromissoryNoteError';
    this.status = status;
    this.code = code;
  }
}

export type PromissoryNoteDocumentView = {
  id: string;
  version: number;
  emitted: boolean;
  emittedAt: string | null;
  generatedAt: string;
  amount: number;
  dueDate: string;
  fileName: string;
  contractId: string;
  contractNumber: string;
};

export type PromissoryNoteStatusPayload = {
  visible: boolean;
  eligibility: PromissoryNoteEligibility;
  document: PromissoryNoteDocumentView | null;
  versions: PromissoryNoteDocumentView[];
  draftPreview: {
    amountFmt: string;
    dueDateFmt: string;
    payableAt: string;
    favorecidosPhrase: string;
  } | null;
};

function toDocView(row: SaleDocumentRow): PromissoryNoteDocumentView | null {
  if (String(row.document_type || '').toUpperCase() !== PROMISSORY_NOTE_DOCUMENT_TYPE) {
    return null;
  }
  const meta = parsePromissoryNoteDescription(row.description);
  return {
    id: row.id,
    version: meta?.version || 1,
    emitted: isPromissoryNoteEmitted(meta),
    emittedAt: meta?.emitted_at || null,
    generatedAt: meta?.generated_at || row.created_at,
    amount: meta?.amount || 0,
    dueDate: meta?.due_date || '',
    fileName: row.original_file_name,
    contractId: meta?.contract_id || '',
    contractNumber: meta?.contract_number || '',
  };
}

function nextArtifactVersion(rows: SaleDocumentRow[]): number {
  let max = 0;
  for (const row of rows) {
    const v = parsePromissoryNoteDescription(row.description)?.version || 0;
    if (v > max) max = v;
  }
  return Math.max(1, max + 1);
}

async function softDeleteDraftOnly(
  admin: SupabaseClient,
  row: SaleDocumentRow,
): Promise<void> {
  const meta = parsePromissoryNoteDescription(row.description);
  if (isPromissoryNoteEmitted(meta)) {
    throw new PromissoryNoteError(
      'Não é permitido substituir Nota Promissória já emitida/baixada.',
      409,
      'already_emitted',
    );
  }
  const { error } = await admin
    .from('sale_documents')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .is('deleted_at', null);
  if (error) {
    throw new PromissoryNoteError(
      `Falha ao substituir rascunho: ${error.message}`,
      500,
    );
  }
}

async function assertContractTenantAccess(
  admin: SupabaseClient,
  contract: Record<string, unknown>,
  userId: string,
): Promise<{ tenantId: string; role: string }> {
  const profile = await resolveCallerProfile(admin, userId);
  if (!profile) {
    throw new PromissoryNoteError('Perfil de usuário não encontrado.', 403);
  }
  const role = String(profile.role || '').toUpperCase();
  if (role === 'OWNER') {
    throw new PromissoryNoteError(
      'Perfil OWNER possui acesso somente leitura.',
      403,
    );
  }
  const tenantId = String(contract.tenant_id || contract.company_id || '');
  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  );
  const isSuperAdmin = PLATFORM_ADMIN_ROLES.has(role);
  if (!tenantId) {
    throw new PromissoryNoteError(
      'Contrato sem tenant_id — não é possível identificar a empresa.',
      400,
    );
  }
  if (!isSuperAdmin && (!callerTenant || callerTenant !== tenantId)) {
    throw new PromissoryNoteError('Sem permissão para este contrato.', 403);
  }
  return { tenantId, role };
}

function normalizeReceipts(
  rows: Array<Record<string, unknown>> | null | undefined,
): PromissoryNoteReceiptRef[] {
  return (rows || []).map((r) => {
    const installmentNumber = Number(r.installment_number);
    const amount = Number(r.amount);
    return {
      amount: Number.isFinite(amount) ? amount : null,
      due_date: (r.due_date as string | null | undefined) ?? null,
      status: (r.status as string | null | undefined) ?? null,
      installment_number: Number.isFinite(installmentNumber)
        ? installmentNumber
        : null,
    };
  });
}

async function loadPromissoryNoteContext(
  admin: SupabaseClient,
  contractId: string,
  userId: string,
) {
  const contract = await loadSaleContractContext(admin, contractId);
  const { tenantId, role } = await assertContractTenantAccess(
    admin,
    contract,
    userId,
  );
  const saleId = String(contract.sale_id || '').trim();
  if (!saleId) {
    throw new PromissoryNoteError(
      'Contrato sem venda vinculada — Nota Promissória indisponível.',
      400,
    );
  }

  const saleCtx = await assertSaleDocumentSaleAccess(admin, saleId, userId);
  if (saleCtx.tenantId && saleCtx.tenantId !== tenantId) {
    throw new PromissoryNoteError(
      'A venda vinculada pertence a outra empresa.',
      403,
      'tenant_mismatch',
    );
  }

  const session: RegenerationSession = {
    contractTenantId: tenantId,
    activeTenantId: tenantId,
    callerRole: role,
  };
  const fresh = await loadFreshRegenerationEntities(admin, contract, session);
  const isAraguaia = isPromissoryNoteAraguaiaModel({
    saleModel: fresh.sale.contract_model,
    contractModel: contract.contract_model,
    projectModel: fresh.project.contract_model,
    companyModel: fresh.company.contract_model,
    projectName: fresh.project.name,
  });

  return {
    contract,
    saleId,
    sale: fresh.sale,
    company: fresh.company,
    customer: fresh.customer,
    project: fresh.project,
    receipts: normalizeReceipts(fresh.finance_receipts),
    isAraguaia,
    tenantId,
    saleCtx,
    contractNumber: String(contract.contract_number || contract.id || ''),
    contractStatus: String(contract.status || ''),
  };
}

async function listPromissoryNoteRows(
  admin: SupabaseClient,
  saleId: string,
): Promise<SaleDocumentRow[]> {
  const rows = await listSaleDocuments(admin, saleId, 'SYSTEM_GENERATED');
  return rows
    .filter(
      (r) =>
        String(r.document_type || '').toUpperCase() === PROMISSORY_NOTE_DOCUMENT_TYPE,
    )
    .sort((a, b) => {
      const va = parsePromissoryNoteDescription(a.description)?.version || 0;
      const vb = parsePromissoryNoteDescription(b.description)?.version || 0;
      return vb - va || String(b.created_at).localeCompare(String(a.created_at));
    });
}

export async function getPromissoryNoteStatus(
  admin: SupabaseClient,
  contractId: string,
  userId: string,
): Promise<PromissoryNoteStatusPayload> {
  const ctx = await loadPromissoryNoteContext(admin, contractId, userId);
  if (!ctx.isAraguaia) {
    return {
      visible: false,
      eligibility: {
        applicable: false,
        reason: 'not_araguaia',
        tooltip: null,
      },
      document: null,
      versions: [],
      draftPreview: null,
    };
  }

  const rows = await listPromissoryNoteRows(admin, ctx.saleId);
  const versions = rows
    .map(toDocView)
    .filter(Boolean) as PromissoryNoteDocumentView[];
  const current = versions[0] || null;

  const eligibility = resolvePromissoryNoteEligibility({
    isAraguaia: true,
    sale: ctx.sale,
    receipts: ctx.receipts,
    contractStatus: ctx.contractStatus,
    hasExistingDocument: Boolean(current),
  });

  let draftPreview: PromissoryNoteStatusPayload['draftPreview'] = null;
  if (eligibility.reason === 'ok' || eligibility.reason === 'cancelled_history_only') {
    const built = buildPromissoryNoteDraft({
      contractId: String(ctx.contract.id),
      contractNumber: ctx.contractNumber,
      saleId: ctx.saleId,
      sale: ctx.sale,
      receipts: ctx.receipts,
      project: ctx.project,
      company: ctx.company,
      customer: ctx.customer,
    });
    if (built.ok) {
      draftPreview = {
        amountFmt: built.draft.amountFmt,
        dueDateFmt: built.draft.dueDateFmt,
        payableAt: built.draft.payableAt,
        favorecidosPhrase: built.draft.favorecidosPhrase,
      };
    }
  }

  return {
    visible: true,
    eligibility,
    document: current,
    versions,
    draftPreview,
  };
}

async function persistArtifact(input: {
  admin: SupabaseClient;
  userId: string;
  saleId: string;
  draft: PromissoryNoteDraft;
  version: number;
  replaceDraftRow?: SaleDocumentRow | null;
}): Promise<SaleDocumentRow> {
  const { admin, userId, saleId, draft, version, replaceDraftRow } = input;
  const saleCtx = await assertSaleDocumentSaleAccess(admin, saleId, userId);
  const pdfBytes = buildPromissoryNotePdfBytes(draft);
  const fileName = buildPromissoryNoteFilename({
    contractNumber: draft.contractNumber,
    version,
  });
  const storagePath = buildUploadStoragePathForSale({
    ctx: saleCtx,
    saleId,
    category: 'SYSTEM_GENERATED',
    fileName,
  });

  const { error: uploadError } = await admin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadError) {
    throw new PromissoryNoteError(
      `Falha ao gravar PDF da Nota Promissória: ${uploadError.message}`,
      500,
    );
  }

  const generatedAt = new Date().toISOString();
  const meta: PromissoryNoteArtifactMetadata = {
    contract_id: draft.contractId,
    contract_number: draft.contractNumber,
    document_type: PROMISSORY_NOTE_DOCUMENT_TYPE,
    promissory_note_number: PROMISSORY_NOTE_LEGAL_NUMBER,
    version,
    amount: draft.amount,
    due_date: draft.dueDateRaw,
    generated_at: generatedAt,
    source: PROMISSORY_NOTE_SOURCE,
    emitted_at: null,
    payable_at: draft.payableAt,
  };

  let replacedDraft = false;
  try {
    if (replaceDraftRow) {
      await softDeleteDraftOnly(admin, replaceDraftRow);
      replacedDraft = true;
    }
    return await createSystemGeneratedSaleDocumentMetadata(admin, {
      saleId,
      ctx: saleCtx,
      userId,
      documentType: PROMISSORY_NOTE_DOCUMENT_TYPE,
      description: serializePromissoryNoteDescription(meta),
      originalFileName: fileName,
      storagePath,
      mimeType: 'application/pdf',
      fileSize: pdfBytes.byteLength,
    });
  } catch (err) {
    await admin.storage.from(SALE_DOCUMENTS_STORAGE_BUCKET).remove([storagePath]);
    if (replaceDraftRow && replacedDraft) {
      await admin
        .from('sale_documents')
        .update({
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', replaceDraftRow.id);
    }
    if (err instanceof SaleDocumentError) {
      throw new PromissoryNoteError(err.message, err.status);
    }
    throw err;
  }
}

export async function generatePromissoryNote(
  admin: SupabaseClient,
  contractId: string,
  userId: string,
  options?: { forceRegenerate?: boolean },
): Promise<{
  document: PromissoryNoteDocumentView;
  html: string;
  draft: PromissoryNoteDraft;
}> {
  const ctx = await loadPromissoryNoteContext(admin, contractId, userId);
  if (!ctx.isAraguaia) {
    throw new PromissoryNoteError(
      'Nota Promissória disponível apenas para contratos ARAGUAIA.',
      400,
      'not_araguaia',
    );
  }

  const rows = await listPromissoryNoteRows(admin, ctx.saleId);
  const current = rows[0] || null;
  const currentMeta = current
    ? parsePromissoryNoteDescription(current.description)
    : null;
  const currentEmitted = isPromissoryNoteEmitted(currentMeta);

  const eligibility = resolvePromissoryNoteEligibility({
    isAraguaia: true,
    sale: ctx.sale,
    receipts: ctx.receipts,
    contractStatus: ctx.contractStatus,
    hasExistingDocument: Boolean(current),
  });

  if (eligibility.reason === 'cancelled_no_doc') {
    throw new PromissoryNoteError(
      eligibility.tooltip || 'Contrato cancelado.',
      400,
      eligibility.reason,
    );
  }
  if (eligibility.reason === 'cancelled_history_only') {
    throw new PromissoryNoteError(
      'Contrato cancelado — permitido apenas abrir/baixar Nota Promissória já emitida.',
      400,
      eligibility.reason,
    );
  }
  if (!eligibility.applicable) {
    throw new PromissoryNoteError(
      eligibility.tooltip || 'Nota Promissória indisponível para esta venda.',
      400,
      eligibility.reason,
    );
  }

  const built = buildPromissoryNoteDraft({
    contractId: String(ctx.contract.id),
    contractNumber: ctx.contractNumber,
    saleId: ctx.saleId,
    sale: ctx.sale,
    receipts: ctx.receipts,
    project: ctx.project,
    company: ctx.company,
    customer: ctx.customer,
  });
  if (!built.ok) {
    throw new PromissoryNoteError(
      built.issues[0]?.message || 'Dados incompletos para Nota Promissória.',
      400,
      built.issues[0]?.code || 'validation',
    );
  }

  let version: number;
  let replaceDraftRow: SaleDocumentRow | null = null;

  if (!current) {
    version = 1;
  } else if (!currentEmitted) {
    version = currentMeta?.version || 1;
    replaceDraftRow = current;
  } else if (options?.forceRegenerate) {
    version = nextArtifactVersion(rows);
  } else {
    throw new PromissoryNoteError(
      'Nota Promissória já emitida. Use regenerar para criar nova versão técnica.',
      409,
      'already_emitted',
    );
  }

  const row = await persistArtifact({
    admin,
    userId,
    saleId: ctx.saleId,
    draft: built.draft,
    version,
    replaceDraftRow,
  });
  const view = toDocView(row);
  if (!view) {
    throw new PromissoryNoteError('Falha ao registrar Nota Promissória.', 500);
  }

  return {
    document: view,
    html: buildPromissoryNoteHtml(built.draft),
    draft: built.draft,
  };
}

async function markPromissoryNoteEmitted(
  admin: SupabaseClient,
  input: {
    saleId: string;
    companyId: string;
    row: SaleDocumentRow;
  },
): Promise<PromissoryNoteDocumentView> {
  const meta = parsePromissoryNoteDescription(input.row.description);
  if (!meta) {
    throw new PromissoryNoteError('Metadata da Nota Promissória inválida.', 500);
  }

  if (meta.emitted_at) {
    const existing = toDocView(input.row);
    if (!existing) throw new PromissoryNoteError('Documento inválido.', 500);
    return existing;
  }

  meta.emitted_at = new Date().toISOString();
  try {
    const updated = await updateSaleDocumentDescription(admin, {
      saleId: input.saleId,
      documentId: input.row.id,
      companyId: input.companyId,
      description: serializePromissoryNoteDescription(meta),
    });
    const view = toDocView(updated);
    if (!view) throw new PromissoryNoteError('Documento inválido.', 500);
    return view;
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      throw new PromissoryNoteError(err.message, err.status);
    }
    throw err;
  }
}

export async function openOrDownloadPromissoryNote(
  admin: SupabaseClient,
  contractId: string,
  userId: string,
  options: { download: boolean; documentId?: string | null },
): Promise<{
  url: string;
  fileName: string;
  mimeType: string;
  document: PromissoryNoteDocumentView;
}> {
  const ctx = await loadPromissoryNoteContext(admin, contractId, userId);
  if (!ctx.isAraguaia) {
    throw new PromissoryNoteError(
      'Nota Promissória disponível apenas para contratos ARAGUAIA.',
      400,
    );
  }

  const rows = await listPromissoryNoteRows(admin, ctx.saleId);
  if (!rows.length) {
    throw new PromissoryNoteError('Nenhuma Nota Promissória encontrada.', 404);
  }

  const target =
    (options.documentId
      ? rows.find((r) => r.id === options.documentId)
      : rows[0]) || null;
  if (!target) {
    throw new PromissoryNoteError('Documento não encontrado.', 404);
  }

  const saleCtx = await assertSaleDocumentSaleAccess(admin, ctx.saleId, userId);
  let view = toDocView(target);
  if (!view) {
    throw new PromissoryNoteError('Documento inválido.', 500);
  }

  if (options.download) {
    view = await markPromissoryNoteEmitted(admin, {
      saleId: ctx.saleId,
      companyId: saleCtx.companyId,
      row: target,
    });
  }

  const signed = await createSaleDocumentSignedUrl(admin, {
    saleId: ctx.saleId,
    documentId: target.id,
    companyId: saleCtx.companyId,
  });

  return {
    url: signed.url,
    fileName: signed.fileName,
    mimeType: signed.mimeType,
    document: view,
  };
}
