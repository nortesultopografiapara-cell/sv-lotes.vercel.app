/**
 * Execução linha a linha — contratos antigos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isLegacyContractSchemaColumnError } from '@/lib/legacy-contracts/schemaCompat';
import { lookupLegacyContractPdf } from '@/lib/imports/modules/legacy-contracts/pdfIndex';
import { uploadLegacyContractPdf } from '@/lib/imports/modules/legacy-contracts/storage';
import type {
  LegacyContractPdfIndex,
  ValidatedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';

function buildLegacyContractInsertPayload(params: {
  tenantId: string;
  userId: string;
  row: ValidatedLegacyContractRow;
  storagePath: string;
  migrationId?: string | null;
  extended: boolean;
}) {
  const { row, tenantId, userId, storagePath, migrationId, extended } = params;
  const notes = [row.observacoes, row.manual_link_notes].filter(Boolean).join(' | ') || null;

  const base = {
    company_id: tenantId,
    tenant_id: tenantId,
    sale_id: row.sale_id,
    customer_id: row.customer_id,
    project_id: row.project_id,
    block_id: row.block_id,
    original_file_name: row.nome_arquivo_pdf,
    storage_path: storagePath,
    contract_number: row.numero_contrato_antigo || null,
    contract_date: row.data_contrato,
    status: row.status_contrato,
    notes,
    created_by: userId,
  };

  if (!extended) return base;

  return {
    ...base,
    quadra: row.quadra || null,
    lote: row.lote || null,
    link_type: row.manual_link_applied ? 'manual' : 'automatic',
    source: 'legacy_migration',
    migration_id: migrationId || null,
    is_active: true,
  };
}

async function insertLegacyContractDocument(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await admin
    .from('legacy_contract_documents')
    .insert([payload])
    .select('id')
    .single();

  if (error) {
    return { error: error.message };
  }

  return { id: String(data?.id) };
}

export async function executeImportableLegacyContractRow(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  row: ValidatedLegacyContractRow;
  pdfIndex: LegacyContractPdfIndex;
  migrationId?: string | null;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const { row, pdfIndex, admin, tenantId, userId, migrationId } = params;

  if (!row.importable || !row.sale_id) {
    return { ok: false, error: 'Linha não importável.' };
  }

  if (row.existing_legacy_document_id) {
    return { ok: false, error: 'Contrato antigo já anexado para esta venda.' };
  }

  const pdfBuffer = lookupLegacyContractPdf(pdfIndex, row.nome_arquivo_pdf);
  if (!pdfBuffer) {
    return { ok: false, error: 'PDF não encontrado no upload/ZIP.' };
  }

  let storagePath: string;
  try {
    const uploaded = await uploadLegacyContractPdf({
      admin,
      tenantId,
      saleId: row.sale_id,
      projectId: row.project_id,
      quadra: row.quadra,
      lote: row.lote,
      fileName: row.nome_arquivo_pdf,
      pdfBuffer,
    });
    storagePath = uploaded.storagePath;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar PDF.',
    };
  }

  const extendedPayload = buildLegacyContractInsertPayload({
    tenantId,
    userId,
    row,
    storagePath,
    migrationId,
    extended: true,
  });

  let inserted = await insertLegacyContractDocument(admin, extendedPayload);
  if ('error' in inserted && isLegacyContractSchemaColumnError(inserted.error)) {
    console.warn('[executeImportableLegacyContractRow] fallback insert base:', inserted.error);
    inserted = await insertLegacyContractDocument(
      admin,
      buildLegacyContractInsertPayload({
        tenantId,
        userId,
        row,
        storagePath,
        migrationId,
        extended: false,
      }),
    );
  }

  if ('error' in inserted) {
    await admin.storage.from('legacy-contracts').remove([storagePath]);
    return { ok: false, error: inserted.error };
  }

  return { ok: true, documentId: inserted.id };
}

export function buildLegacyContractExecutionExpectation(row: ValidatedLegacyContractRow) {
  return {
    attachesLegacyPdf: row.importable && Boolean(row.sale_id),
    skipsExisting: Boolean(row.existing_legacy_document_id),
    doesNotCreateSale: true,
    doesNotSendSignature: true,
    doesNotUpdateBlock: true,
    doesNotUpdateFinance: true,
  };
}
