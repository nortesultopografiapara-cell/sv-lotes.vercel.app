import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OPERATION_DOCUMENTS_STORAGE_BUCKET,
  type MasterTopographyOperationDocument,
  type MasterTopographyOperationDocumentInput,
  type OperationDocumentType,
} from './operationDocumentTypes';
import {
  buildOperationDocumentStoragePath,
  sanitizeOperationDocumentFileName,
  validateOperationDocumentFileSize,
  validateOperationDocumentMimeType,
} from './operationDocumentValidation';
import { getTopographyOperationById, logTopographyOperationAudit } from './operationService';

const SELECT_COLUMNS = `
  id, operation_id, type, title, storage_path, file_name, mime_type, file_size,
  file_hash, notes, created_by, created_at, deleted_at, deleted_by
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyOperationDocument {
  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    type: row.type as OperationDocumentType,
    title: String(row.title || ''),
    storage_path: String(row.storage_path || ''),
    file_name: String(row.file_name || ''),
    mime_type: String(row.mime_type || ''),
    file_size: Number(row.file_size || 0),
    file_hash: row.file_hash ? String(row.file_hash) : null,
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
  };
}

export function hashOperationDocumentContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function listOperationDocuments(
  supabase: SupabaseClient,
  operationId: string,
  opts?: { includeDeleted?: boolean },
): Promise<MasterTopographyOperationDocument[]> {
  let query = supabase
    .from('master_topography_operation_documents')
    .select(SELECT_COLUMNS)
    .eq('operation_id', operationId)
    .order('created_at', { ascending: false });
  if (!opts?.includeDeleted) query = query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar documentos.');
  return (data || []).map((r) => parseRow(r as unknown as Record<string, unknown>));
}

export async function getOperationDocumentById(
  supabase: SupabaseClient,
  operationId: string,
  documentId: string,
): Promise<MasterTopographyOperationDocument | null> {
  const { data, error } = await supabase
    .from('master_topography_operation_documents')
    .select(SELECT_COLUMNS)
    .eq('id', documentId)
    .eq('operation_id', operationId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar documento.');
  if (!data) return null;
  return parseRow(data as unknown as Record<string, unknown>);
}

export async function uploadOperationDocument(
  supabase: SupabaseClient,
  params: {
    operationId: string;
    meta: MasterTopographyOperationDocumentInput;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    createdBy: string | null;
  },
): Promise<MasterTopographyOperationDocument> {
  const operation = await getTopographyOperationById(supabase, params.operationId);
  if (!operation) throw new Error('Operação não encontrada.');

  const mimeCheck = validateOperationDocumentMimeType(params.mimeType, params.fileName);
  if (!mimeCheck.valid) throw new Error(mimeCheck.message);

  const sizeCheck = validateOperationDocumentFileSize(params.buffer.length);
  if (!sizeCheck.valid) throw new Error(sizeCheck.message);

  const fileHash = hashOperationDocumentContent(params.buffer);
  const { data: dup } = await supabase
    .from('master_topography_operation_documents')
    .select('id')
    .eq('operation_id', params.operationId)
    .eq('file_hash', fileHash)
    .is('deleted_at', null)
    .maybeSingle();
  if (dup) throw new Error('Arquivo duplicado: este conteúdo já está anexado à OS.');

  const safeName = sanitizeOperationDocumentFileName(params.fileName);
  const storagePath = buildOperationDocumentStoragePath({
    operationId: params.operationId,
    fileName: safeName,
  });

  const { error: uploadError } = await supabase.storage
    .from(OPERATION_DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: mimeCheck.mimeType,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message || 'Falha no upload.');

  const { data, error } = await supabase
    .from('master_topography_operation_documents')
    .insert({
      operation_id: params.operationId,
      type: params.meta.type,
      title: params.meta.title,
      storage_path: storagePath,
      file_name: safeName,
      mime_type: mimeCheck.mimeType,
      file_size: params.buffer.length,
      file_hash: fileHash,
      notes: params.meta.notes ?? null,
      created_by: params.createdBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    await supabase.storage.from(OPERATION_DOCUMENTS_STORAGE_BUCKET).remove([storagePath]);
    if (error.code === '23505') {
      throw new Error('Arquivo duplicado: este conteúdo já está anexado à OS.');
    }
    throw new Error(error.message || 'Falha ao registrar documento.');
  }

  const doc = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId: params.createdBy,
    action: 'TOPOGRAPHY_OPERATION_DOCUMENT_UPLOADED',
    entityId: params.operationId,
    description: `Documento anexado: ${doc.title}`,
    newData: { document_id: doc.id, type: doc.type },
  });
  return doc;
}

export async function softDeleteOperationDocument(
  supabase: SupabaseClient,
  params: {
    operationId: string;
    documentId: string;
    deletedBy: string | null;
  },
): Promise<MasterTopographyOperationDocument> {
  const existing = await getOperationDocumentById(
    supabase,
    params.operationId,
    params.documentId,
  );
  if (!existing) throw new Error('Documento não encontrado.');
  if (existing.deleted_at) throw new Error('Documento já excluído.');

  const { data, error } = await supabase
    .from('master_topography_operation_documents')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: params.deletedBy,
    })
    .eq('id', params.documentId)
    .eq('operation_id', params.operationId)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message || 'Falha ao excluir documento.');

  const doc = parseRow(data as unknown as Record<string, unknown>);
  await logTopographyOperationAudit(supabase, {
    userId: params.deletedBy,
    action: 'TOPOGRAPHY_OPERATION_DOCUMENT_DELETED',
    entityId: params.operationId,
    description: `Documento excluído: ${doc.title}`,
    newData: { document_id: doc.id },
  });
  return doc;
}

export async function createOperationDocumentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 120,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(OPERATION_DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Falha ao gerar URL assinada.');
  }
  return data.signedUrl;
}
