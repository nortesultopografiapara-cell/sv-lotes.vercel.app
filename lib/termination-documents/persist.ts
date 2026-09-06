/**
 * Persistência do snapshot documental e materialização do PDF.
 * Retry NÃO recalcula settlement nem reexecuta release.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseImprovementsFromCalculationSnapshot, parseObligationFromCalculationSnapshot } from '@/lib/contract-termination/improvements';
import {
  buildUploadStoragePathForSale,
  createSystemGeneratedSaleDocumentMetadata,
} from '@/lib/saleDocumentService';
import { SALE_DOCUMENTS_STORAGE_BUCKET } from '@/lib/saleDocuments';
import { loadHistoricalSaleContractId } from '@/lib/saleHistoricalContract';
import { loadTerminationDocumentContext } from '@/lib/termination-documents/context';
import { assertFrozenHtmlUnchanged } from '@/lib/termination-documents/hash';
import {
  allocateSaleOperationDocumentNumber,
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
} from '@/lib/termination-documents/numbering';
import {
  terminationDocumentFileSlug,
  terminationDocumentPrefixForType,
  terminationOriginalSaleDocumentType,
} from '@/lib/termination-documents/documentKinds';
import { renderTerminationDocumentPdfFromFrozenHtml } from '@/lib/termination-documents/pdf';
import {
  buildTerminationDocumentSnapshot,
  parseTerminationDocumentSnapshot,
  type FrozenSettlementFinance,
} from '@/lib/termination-documents/snapshot';
import {
  parseRefundScheduleFromCalculationSnapshot,
  shouldDefineRefundSchedule,
  undefinedRefundSchedule,
} from '@/lib/termination-documents/refundSchedule';
import { shouldGenerateTerminationDocument } from '@/lib/termination-documents/titles';
import {
  SALE_DOCUMENT_TYPE_DESISTENCIA,
  type TerminationDocumentSnapshot,
  type TerminationDocumentStatus,
  type TerminationRefundSchedule,
} from '@/lib/termination-documents/types';

export class TerminationDocumentError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'TerminationDocumentError';
    this.code = code;
  }
}

const SETTLEMENT_DOC_COLUMNS =
  'id, company_id, tenant_id, sale_id, contract_id, block_id, project_id, operation_type, status, calculation_status, total_paid, entry_amount, signal_amount, non_refundable_amount, refundable_base, retention_percent, retention_amount, agreed_refund_amount, contractual_refund_amount, refund_installments, refund_destination, improvement_status, policy_snapshot, calculation_snapshot, receipts_snapshot, operator_user_id, document_number, document_status, document_id, termination_document_snapshot, document_hash, reason, reason_detail';

export type SettlementDocumentRow = FrozenSettlementFinance & {
  tenant_id?: string | null;
  status?: string | null;
  document_number?: string | null;
  document_status?: TerminationDocumentStatus | null;
  document_id?: string | null;
  termination_document_snapshot?: unknown;
  document_hash?: string | null;
};

export function documentViewFromSnapshot(
  snapshot: TerminationDocumentSnapshot | null,
  status: TerminationDocumentStatus | null,
): {
  documentNumber: string | null;
  documentStatus: string | null;
  title: string | null;
  html: string | null;
  saleId: string | null;
  settlementId: string | null;
  canView: boolean;
  canDownload: boolean;
} | null {
  if (!snapshot) return null;
  const generated = status === 'GENERATED' || status === 'SIGNED';
  return {
    documentNumber: snapshot.documentNumber,
    documentStatus: status,
    title: snapshot.title,
    html: snapshot.html,
    saleId: snapshot.saleId,
    settlementId: snapshot.settlementId,
    canView: Boolean(snapshot.html),
    canDownload: generated,
  };
}

async function findExistingDesistenciaSaleDocument(
  admin: SupabaseClient,
  saleId: string,
  companyId: string,
  documentType: string = SALE_DOCUMENT_TYPE_DESISTENCIA,
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from('sale_documents')
    .select('id')
    .eq('sale_id', saleId)
    .eq('company_id', companyId)
    .eq('document_type', documentType)
    .eq('category', 'SYSTEM_GENERATED')
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data?.id) return null;
  return { id: String(data.id) };
}

export async function loadSettlementForDocument(
  admin: SupabaseClient,
  settlementId: string,
  saleId: string,
): Promise<SettlementDocumentRow> {
  const { data, error } = await admin
    .from('sale_release_settlements')
    .select(SETTLEMENT_DOC_COLUMNS)
    .eq('id', settlementId)
    .eq('sale_id', saleId)
    .maybeSingle();
  if (error || !data) {
    throw new TerminationDocumentError(
      error?.message || 'Acerto financeiro não encontrado.',
      'SETTLEMENT_NOT_FOUND',
    );
  }
  return data as SettlementDocumentRow;
}

export async function freezeTerminationDocumentSnapshot(
  admin: SupabaseClient,
  params: {
    settlementId: string;
    saleId: string;
    companyId: string;
    operatorUserId: string;
  },
): Promise<TerminationDocumentSnapshot> {
  const row = await loadSettlementForDocument(
    admin,
    params.settlementId,
    params.saleId,
  );
  if (!shouldGenerateTerminationDocument(row.operation_type)) {
    throw new TerminationDocumentError(
      'Esta operação não gera termo documental nesta fase.',
      'DOCUMENT_NOT_APPLICABLE',
    );
  }
  if (String(row.company_id) !== String(params.companyId)) {
    throw new TerminationDocumentError('Acerto de outro tenant.', 'CROSS_TENANT');
  }

  const existing = parseTerminationDocumentSnapshot(row.termination_document_snapshot);
  if (existing?.html && existing.documentNumber) {
    assertFrozenHtmlUnchanged(existing.html, existing.contentHash);
    return existing;
  }

  const contractId = await loadHistoricalSaleContractId(admin, {
    saleId: params.saleId,
    settlementContractId: row.contract_id,
  });
  const context = await loadTerminationDocumentContext(admin, {
    companyId: params.companyId,
    saleId: params.saleId,
    contractId,
    blockId: row.block_id ? String(row.block_id) : null,
    projectId: row.project_id ? String(row.project_id) : null,
  });

  const documentNumber =
    String(row.document_number || '').trim() ||
    (await allocateSaleOperationDocumentNumber(
      admin,
      params.companyId,
      terminationDocumentPrefixForType(row.operation_type) ||
        TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
    ));

  const obligation = parseObligationFromCalculationSnapshot(
    row.calculation_snapshot,
    row.agreed_refund_amount == null
      ? Number(row.contractual_refund_amount) || 0
      : Number(row.agreed_refund_amount) || 0,
  );
  const improvements = parseImprovementsFromCalculationSnapshot(row.calculation_snapshot);
  const needed = shouldDefineRefundSchedule({
    destination: row.refund_destination,
    agreedRefundAmount: row.agreed_refund_amount,
    contractualRefundAmount: row.contractual_refund_amount,
    installmentCount: row.refund_installments,
    calculationStatus: row.calculation_status,
    improvementsTotal: obligation.improvementsTotal,
    scheduleTotal:
      improvements.appraisalStatus === 'COMPLETED' ? obligation.total : row.agreed_refund_amount,
  });
  const parsedSchedule = parseRefundScheduleFromCalculationSnapshot(
    row.calculation_snapshot,
  );
  let refundSchedule: TerminationRefundSchedule = undefinedRefundSchedule(
    row.refund_installments,
  );
  if (needed) {
    if (!parsedSchedule?.defined) {
      throw new TerminationDocumentError(
        'Informe o vencimento da 1ª parcela de restituição antes de gerar o termo.',
        'REFUND_SCHEDULE_DATE_REQUIRED',
      );
    }
    refundSchedule = parsedSchedule;
  }

  const snapshot = buildTerminationDocumentSnapshot({
    settlement: { ...row, contract_id: contractId, operator_user_id: params.operatorUserId },
    context,
    documentNumber,
    refundSchedule,
  });

  const now = new Date().toISOString();
  const { error } = await admin
    .from('sale_release_settlements')
    .update({
      termination_document_snapshot: snapshot,
      document_number: snapshot.documentNumber,
      document_status: 'PENDING',
      document_hash: snapshot.contentHash,
      document_generated_by: params.operatorUserId,
      updated_at: now,
    })
    .eq('id', params.settlementId)
    .eq('sale_id', params.saleId)
    .eq('company_id', params.companyId)
    .in('status', ['CALCULATED', 'EXECUTED']);

  if (error) {
    throw new TerminationDocumentError(
      `Não foi possível congelar o termo: ${error.message}`,
      'DOCUMENT_SNAPSHOT_FAILED',
    );
  }
  return snapshot;
}

export async function materializeTerminationDocumentPdf(
  admin: SupabaseClient,
  params: {
    settlementId: string;
    saleId: string;
    companyId: string;
    operatorUserId: string;
  },
): Promise<{
  snapshot: TerminationDocumentSnapshot;
  documentStatus: TerminationDocumentStatus;
  documentId: string | null;
}> {
  const row = await loadSettlementForDocument(
    admin,
    params.settlementId,
    params.saleId,
  );
  if (String(row.company_id) !== String(params.companyId)) {
    throw new TerminationDocumentError('Acerto de outro tenant.', 'CROSS_TENANT');
  }
  const snapshot = parseTerminationDocumentSnapshot(row.termination_document_snapshot);
  if (!snapshot) {
    throw new TerminationDocumentError(
      'Snapshot documental ausente. Não é permitido reconstruir o termo.',
      'DOCUMENT_SNAPSHOT_MISSING',
    );
  }
  assertFrozenHtmlUnchanged(snapshot.html, snapshot.contentHash);

  if (
    (row.document_status === 'GENERATED' || row.document_status === 'SIGNED') &&
    row.document_id
  ) {
    return {
      snapshot,
      documentStatus: row.document_status as TerminationDocumentStatus,
      documentId: String(row.document_id),
    };
  }

  const existingDoc = await findExistingDesistenciaSaleDocument(
    admin,
    params.saleId,
    params.companyId,
    terminationOriginalSaleDocumentType(snapshot.operationType),
  );
  if (existingDoc?.id) {
    const keepSigned = row.document_status === 'SIGNED';
    const now = new Date().toISOString();
    const { error } = await admin
      .from('sale_release_settlements')
      .update({
        document_id: existingDoc.id,
        document_status: keepSigned ? 'SIGNED' : 'GENERATED',
        document_generated_at: now,
        document_generated_by: params.operatorUserId,
        document_hash: snapshot.contentHash,
        updated_at: now,
      })
      .eq('id', params.settlementId)
      .eq('sale_id', params.saleId)
      .eq('company_id', params.companyId)
      .eq('status', 'EXECUTED');
    if (error) {
      throw new TerminationDocumentError(error.message, 'DOCUMENT_PDF_FAILED');
    }
    return {
      snapshot,
      documentStatus: keepSigned ? 'SIGNED' : 'GENERATED',
      documentId: String(existingDoc.id),
    };
  }

  try {
    const pdfBytes = await renderTerminationDocumentPdfFromFrozenHtml(snapshot);
    const fileName = `${terminationDocumentFileSlug(snapshot.operationType)}-${snapshot.documentNumber.replace(/\//g, '-')}.pdf`;
    const storagePath = buildUploadStoragePathForSale({
      ctx: {
        tenantId: String(row.tenant_id || params.companyId),
        companyId: params.companyId,
        projectId: row.project_id ? String(row.project_id) : null,
        lotId: row.block_id ? String(row.block_id) : null,
        buyerId: snapshot.customerId,
      },
      saleId: params.saleId,
      category: 'SYSTEM_GENERATED',
      fileName,
    });

    const { error: uploadError } = await admin.storage
      .from(SALE_DOCUMENTS_STORAGE_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const doc = await createSystemGeneratedSaleDocumentMetadata(admin, {
      saleId: params.saleId,
      ctx: {
        tenantId: String(row.tenant_id || params.companyId),
        companyId: params.companyId,
        projectId: row.project_id ? String(row.project_id) : null,
        lotId: row.block_id ? String(row.block_id) : null,
        buyerId: snapshot.customerId,
      },
      userId: params.operatorUserId,
      documentType: terminationOriginalSaleDocumentType(snapshot.operationType),
      description: `${snapshot.title} nº ${snapshot.documentNumber}`,
      originalFileName: fileName,
      storagePath,
      mimeType: 'application/pdf',
      fileSize: pdfBytes.byteLength,
    });

    const now = new Date().toISOString();
    const { error } = await admin
      .from('sale_release_settlements')
      .update({
        document_id: doc.id,
        document_status: 'GENERATED',
        document_generated_at: now,
        document_generated_by: params.operatorUserId,
        document_hash: snapshot.contentHash,
        updated_at: now,
      })
      .eq('id', params.settlementId)
      .eq('sale_id', params.saleId)
      .eq('company_id', params.companyId)
      .eq('status', 'EXECUTED');

    if (error) {
      throw new Error(error.message);
    }
    return {
      snapshot,
      documentStatus: 'GENERATED',
      documentId: doc.id,
    };
  } catch (err) {
    const now = new Date().toISOString();
    await admin
      .from('sale_release_settlements')
      .update({
        document_status: 'FAILED',
        updated_at: now,
      })
      .eq('id', params.settlementId)
      .eq('sale_id', params.saleId)
      .eq('company_id', params.companyId)
      .eq('status', 'EXECUTED');
    throw new TerminationDocumentError(
      err instanceof Error ? err.message : 'Falha ao gerar o PDF do termo.',
      'DOCUMENT_PDF_FAILED',
    );
  }
}

export async function loadTerminationDocumentBySale(
  admin: SupabaseClient,
  params: { saleId: string; companyId: string },
): Promise<{
  snapshot: TerminationDocumentSnapshot;
  documentStatus: TerminationDocumentStatus | null;
  settlementId: string;
  documentId: string | null;
  settlementStatus: string | null;
  settlementContractId: string | null;
} | null> {
  const { data, error } = await admin
    .from('sale_release_settlements')
    .select(SETTLEMENT_DOC_COLUMNS)
    .eq('sale_id', params.saleId)
    .eq('company_id', params.companyId)
    .in('status', ['CALCULATED', 'EXECUTED', 'FAILED_DOCUMENT'])
    .maybeSingle();
  if (error || !data) return null;
  const row = data as SettlementDocumentRow;
  const snapshot = parseTerminationDocumentSnapshot(row.termination_document_snapshot);
  if (!snapshot) return null;
  return {
    snapshot,
    documentStatus: (row.document_status as TerminationDocumentStatus) || null,
    settlementId: String(row.id),
    documentId: row.document_id ? String(row.document_id) : null,
    settlementStatus: row.status ? String(row.status) : null,
    settlementContractId: row.contract_id ? String(row.contract_id) : null,
  };
}

export async function retryTerminationDocumentPdf(
  admin: SupabaseClient,
  params: {
    settlementId: string;
    saleId: string;
    companyId: string;
    operatorUserId: string;
  },
): Promise<{
  snapshot: TerminationDocumentSnapshot;
  documentStatus: TerminationDocumentStatus;
  documentId: string | null;
}> {
  const row = await loadSettlementForDocument(
    admin,
    params.settlementId,
    params.saleId,
  );
  if (row.status !== 'EXECUTED') {
    throw new TerminationDocumentError(
      'Retry documental só é permitido após o encerramento executado.',
      'DOCUMENT_RETRY_NOT_EXECUTED',
    );
  }
  return materializeTerminationDocumentPdf(admin, params);
}
