import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EQUIPMENT_DOCUMENTS_STORAGE_BUCKET,
  type MasterTopographyEquipmentDocument,
  type MasterTopographyEquipmentDocumentInput,
} from './equipmentDocumentTypes';
import {
  buildEquipmentDocumentStoragePath,
  validateEquipmentDocumentFileSize,
  validateEquipmentDocumentMimeType,
} from './equipmentDocumentValidation';
import {
  getTopographyEquipmentById,
  logTopographyEquipmentAudit,
  patchTopographyEquipmentFields,
} from './equipmentService';

const SELECT_COLUMNS = `
  id, equipment_id, maintenance_id, tipo, titulo, storage_path, file_name,
  mime_type, file_size, content_hash, issued_at, valid_until, notes,
  created_by, created_at, updated_at, deleted_at, deleted_by
`
  .replace(/\s+/g, ' ')
  .trim();

function parseRow(row: Record<string, unknown>): MasterTopographyEquipmentDocument {
  return {
    id: String(row.id),
    equipment_id: String(row.equipment_id),
    maintenance_id: row.maintenance_id ? String(row.maintenance_id) : null,
    tipo: row.tipo as MasterTopographyEquipmentDocument['tipo'],
    titulo: String(row.titulo || ''),
    storage_path: String(row.storage_path || ''),
    file_name: String(row.file_name || ''),
    mime_type: String(row.mime_type || ''),
    file_size: Number(row.file_size || 0),
    content_hash: row.content_hash ? String(row.content_hash) : null,
    issued_at: row.issued_at ? String(row.issued_at).slice(0, 10) : null,
    valid_until: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
  };
}

export function hashEquipmentDocumentContent(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function listEquipmentDocuments(
  supabase: SupabaseClient,
  equipmentId: string,
  opts?: { maintenanceId?: string | null; includeDeleted?: boolean },
): Promise<MasterTopographyEquipmentDocument[]> {
  let query = supabase
    .from('master_topography_equipment_documents')
    .select(SELECT_COLUMNS)
    .eq('equipment_id', equipmentId)
    .order('created_at', { ascending: false });

  if (!opts?.includeDeleted) {
    query = query.is('deleted_at', null);
  }
  if (opts?.maintenanceId) {
    query = query.eq('maintenance_id', opts.maintenanceId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar documentos.');
  return (data || []).map((row) => parseRow(row as unknown as Record<string, unknown>));
}

export async function getEquipmentDocumentById(
  supabase: SupabaseClient,
  equipmentId: string,
  documentId: string,
): Promise<MasterTopographyEquipmentDocument | null> {
  const { data, error } = await supabase
    .from('master_topography_equipment_documents')
    .select(SELECT_COLUMNS)
    .eq('id', documentId)
    .eq('equipment_id', equipmentId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar documento.');
  if (!data) return null;
  return parseRow(data as unknown as Record<string, unknown>);
}

export async function uploadEquipmentDocument(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    meta: MasterTopographyEquipmentDocumentInput;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    createdBy: string | null;
  },
): Promise<MasterTopographyEquipmentDocument> {
  const equipment = await getTopographyEquipmentById(supabase, params.equipmentId);
  if (!equipment) throw new Error('Equipamento não encontrado.');

  const mimeCheck = validateEquipmentDocumentMimeType(params.mimeType, params.fileName);
  if (!mimeCheck.valid) throw new Error(mimeCheck.message);

  const sizeCheck = validateEquipmentDocumentFileSize(params.buffer.length);
  if (!sizeCheck.valid) throw new Error(sizeCheck.message);

  const contentHash = hashEquipmentDocumentContent(params.buffer);

  const { data: dup } = await supabase
    .from('master_topography_equipment_documents')
    .select('id')
    .eq('equipment_id', params.equipmentId)
    .eq('content_hash', contentHash)
    .is('deleted_at', null)
    .maybeSingle();

  if (dup) {
    throw new Error('Arquivo duplicado: este conteúdo já está anexado ao equipamento.');
  }

  if (params.meta.maintenance_id) {
    const { data: maint } = await supabase
      .from('master_topography_equipment_maintenance')
      .select('id')
      .eq('id', params.meta.maintenance_id)
      .eq('equipment_id', params.equipmentId)
      .maybeSingle();
    if (!maint) throw new Error('Manutenção vinculada não encontrada.');
  }

  const storagePath = buildEquipmentDocumentStoragePath({
    equipmentId: params.equipmentId,
    fileName: params.fileName,
  });

  const { error: uploadError } = await supabase.storage
    .from(EQUIPMENT_DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: mimeCheck.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Falha no upload do arquivo.');
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('master_topography_equipment_documents')
    .insert({
      equipment_id: params.equipmentId,
      maintenance_id: params.meta.maintenance_id ?? null,
      tipo: params.meta.tipo,
      titulo: params.meta.titulo,
      storage_path: storagePath,
      file_name: params.fileName.slice(0, 180),
      mime_type: mimeCheck.mimeType,
      file_size: params.buffer.length,
      content_hash: contentHash,
      issued_at: params.meta.issued_at ?? null,
      valid_until: params.meta.valid_until ?? null,
      notes: params.meta.notes ?? null,
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    await supabase.storage.from(EQUIPMENT_DOCUMENTS_STORAGE_BUCKET).remove([storagePath]);
    if (error.code === '23505' || String(error.message).includes('content_hash')) {
      throw new Error('Arquivo duplicado: este conteúdo já está anexado ao equipamento.');
    }
    throw new Error(error.message || 'Falha ao registrar documento.');
  }

  const doc = parseRow(data as unknown as Record<string, unknown>);

  if (params.meta.tipo === 'PHOTO') {
    try {
      await patchTopographyEquipmentFields(supabase, params.equipmentId, {
        photo_url: storagePath,
      });
    } catch {
      /* sync de foto não bloqueia upload */
    }
  }

  await logTopographyEquipmentAudit(supabase, {
    userId: params.createdBy,
    action: 'TOPOGRAPHY_EQUIPMENT_DOCUMENT_UPLOADED',
    entityId: params.equipmentId,
    description: `Documento ${doc.titulo} (${doc.tipo}) anexado a ${equipment.code}`,
    newData: { document_id: doc.id, tipo: doc.tipo, file_name: doc.file_name },
  });

  return doc;
}

export async function softDeleteEquipmentDocument(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    documentId: string;
    deletedBy: string | null;
  },
): Promise<MasterTopographyEquipmentDocument> {
  const existing = await getEquipmentDocumentById(
    supabase,
    params.equipmentId,
    params.documentId,
  );
  if (!existing || existing.deleted_at) {
    throw new Error('Documento não encontrado.');
  }

  const equipment = await getTopographyEquipmentById(supabase, params.equipmentId);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('master_topography_equipment_documents')
    .update({
      deleted_at: now,
      deleted_by: params.deletedBy,
      updated_at: now,
    })
    .eq('id', params.documentId)
    .eq('equipment_id', params.equipmentId)
    .is('deleted_at', null)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message || 'Falha ao excluir documento.');

  const doc = parseRow(data as unknown as Record<string, unknown>);

  await logTopographyEquipmentAudit(supabase, {
    userId: params.deletedBy,
    action: 'TOPOGRAPHY_EQUIPMENT_DOCUMENT_DELETED',
    entityId: params.equipmentId,
    description: `Documento ${existing.titulo} removido de ${equipment?.code || params.equipmentId}`,
    oldData: { document_id: existing.id, tipo: existing.tipo },
  });

  return doc;
}

export async function createEquipmentDocumentSignedUrl(
  supabase: SupabaseClient,
  params: { equipmentId: string; documentId: string; expiresIn?: number },
): Promise<{ url: string; document: MasterTopographyEquipmentDocument }> {
  const doc = await getEquipmentDocumentById(
    supabase,
    params.equipmentId,
    params.documentId,
  );
  if (!doc || doc.deleted_at) {
    throw new Error('Documento não encontrado.');
  }

  const { data, error } = await supabase.storage
    .from(EQUIPMENT_DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(doc.storage_path, params.expiresIn ?? 120);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Falha ao gerar URL de download.');
  }

  return { url: data.signedUrl, document: doc };
}
