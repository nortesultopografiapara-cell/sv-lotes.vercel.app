/**
 * Serviço de Documentos da Venda — metadata + Storage (multiempresa).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCallerProfile } from '@/lib/supabase/server';
import {
  buildSaleDocumentStoragePath,
  isUploadAllowedForCategory,
  normalizeSaleDocumentCategory,
  SALE_DOCUMENTS_STORAGE_BUCKET,
  SALE_DOCUMENT_CATEGORY_LABELS,
  SALE_DOCUMENT_TYPE_LABELS,
  type SaleDocumentCategory,
  validateSaleDocumentFileSize,
  validateSaleDocumentMimeType,
  validateSaleDocumentType,
} from '@/lib/saleDocuments';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export class SaleDocumentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SaleDocumentError';
    this.status = status;
  }
}

export type SaleDocumentRow = {
  id: string;
  company_id: string;
  tenant_id: string | null;
  project_id: string | null;
  sale_id: string;
  lot_id: string | null;
  buyer_id: string | null;
  category: SaleDocumentCategory;
  document_type: string;
  description: string | null;
  original_file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  uploader_name?: string | null;
};

export type SaleDocumentView = {
  id: string;
  sale_id: string;
  category: SaleDocumentCategory;
  category_label: string;
  document_type: string;
  document_type_label: string;
  description: string | null;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
};

export type SaleContextForDocuments = {
  tenantId: string;
  companyId: string;
  projectId: string | null;
  lotId: string | null;
  buyerId: string | null;
};

export function toSaleDocumentView(row: SaleDocumentRow): SaleDocumentView {
  const type = String(row.document_type || '').toUpperCase();
  return {
    id: row.id,
    sale_id: row.sale_id,
    category: row.category,
    category_label: SALE_DOCUMENT_CATEGORY_LABELS[row.category] || row.category,
    document_type: type,
    document_type_label: SALE_DOCUMENT_TYPE_LABELS[type] || type,
    description: row.description,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    file_size: Number(row.file_size) || 0,
    uploaded_by: row.uploaded_by,
    uploader_name: row.uploader_name ?? null,
    created_at: row.created_at,
  };
}

export async function assertSaleDocumentSaleAccess(
  admin: SupabaseClient,
  saleId: string,
  userId: string,
): Promise<SaleContextForDocuments> {
  const profile = await resolveCallerProfile(admin, userId);
  if (!profile) {
    throw new SaleDocumentError('Perfil de usuário não encontrado.', 403);
  }

  const callerRole = String(profile.role || '').toUpperCase();
  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  );

  const { data: sale, error } = await admin
    .from('sales')
    .select('id, tenant_id, company_id, project_id, block_id, customer_id')
    .eq('id', saleId)
    .maybeSingle();

  if (error) {
    throw new SaleDocumentError(`Erro ao localizar venda: ${error.message}`, 500);
  }
  if (!sale) {
    throw new SaleDocumentError('Venda não encontrada.', 404);
  }

  const saleTenant = String(sale.tenant_id || sale.company_id || '');
  const isSuperAdmin = PLATFORM_ADMIN_ROLES.has(callerRole);

  if (!isSuperAdmin && callerTenant && saleTenant && callerTenant !== saleTenant) {
    throw new SaleDocumentError('Sem permissão para esta venda.', 403);
  }

  const companyId = String(sale.company_id || sale.tenant_id || callerTenant);
  return {
    tenantId: saleTenant || callerTenant,
    companyId,
    projectId: sale.project_id ? String(sale.project_id) : null,
    lotId: sale.block_id ? String(sale.block_id) : null,
    buyerId: sale.customer_id ? String(sale.customer_id) : null,
  };
}

export async function listSaleDocuments(
  admin: SupabaseClient,
  saleId: string,
  category?: SaleDocumentCategory | null,
): Promise<SaleDocumentRow[]> {
  let query = admin
    .from('sale_documents')
    .select(
      'id, company_id, tenant_id, project_id, sale_id, lot_id, buyer_id, category, document_type, description, original_file_name, storage_path, mime_type, file_size, uploaded_by, created_at, updated_at, deleted_at',
    )
    .eq('sale_id', saleId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    if (/Could not find the table|relation .* does not exist/i.test(error.message)) {
      throw new SaleDocumentError(
        'Módulo de documentos ainda não está disponível neste ambiente. Aplique a migration sale_documents.',
        503,
      );
    }
    throw new SaleDocumentError(`Erro ao listar documentos: ${error.message}`, 500);
  }

  const rows = (data || []) as SaleDocumentRow[];
  const uploaderIds = [
    ...new Set(rows.map((r) => r.uploaded_by).filter(Boolean) as string[]),
  ];
  const nameById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: profiles } = await admin
      .from('users')
      .select('id, full_name, name, email')
      .in('id', uploaderIds);
    for (const p of profiles || []) {
      const name =
        String((p as { full_name?: string }).full_name || '').trim() ||
        String((p as { name?: string }).name || '').trim() ||
        String((p as { email?: string }).email || '').trim() ||
        'Usuário';
      nameById.set(String((p as { id: string }).id), name);
    }
  }

  return rows.map((r) => ({
    ...r,
    category: normalizeSaleDocumentCategory(r.category) || 'OTHER',
    uploader_name: r.uploaded_by ? nameById.get(r.uploaded_by) || null : null,
  }));
}

async function insertSaleDocumentRow(
  admin: SupabaseClient,
  input: {
    saleId: string;
    ctx: SaleContextForDocuments;
    userId: string;
    category: SaleDocumentCategory;
    documentType: string;
    description?: string | null;
    originalFileName: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<SaleDocumentRow> {
  const typeCheck = validateSaleDocumentType(input.category, input.documentType);
  if (!typeCheck.valid) {
    throw new SaleDocumentError(typeCheck.message, 400);
  }

  const mimeCheck = validateSaleDocumentMimeType(
    input.mimeType,
    input.originalFileName,
  );
  if (!mimeCheck.valid) {
    throw new SaleDocumentError(mimeCheck.message, 400);
  }

  const sizeCheck = validateSaleDocumentFileSize(input.fileSize);
  if (!sizeCheck.valid) {
    throw new SaleDocumentError(sizeCheck.message, 400);
  }

  const expectedPrefix = `${input.ctx.companyId}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    throw new SaleDocumentError('Caminho de armazenamento inválido para a empresa.', 400);
  }
  if (!input.storagePath.includes(`/${input.saleId}/`)) {
    throw new SaleDocumentError('Caminho de armazenamento não corresponde à venda.', 400);
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('sale_documents')
    .insert({
      company_id: input.ctx.companyId,
      tenant_id: input.ctx.tenantId || input.ctx.companyId,
      project_id: input.ctx.projectId,
      sale_id: input.saleId,
      lot_id: input.ctx.lotId,
      buyer_id: input.ctx.buyerId,
      category: input.category,
      document_type: String(input.documentType).trim().toUpperCase(),
      description: input.description?.trim() || null,
      original_file_name: input.originalFileName,
      storage_path: input.storagePath,
      mime_type: mimeCheck.mimeType,
      file_size: input.fileSize,
      uploaded_by: input.userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new SaleDocumentError(
      error?.message || 'Falha ao registrar documento.',
      500,
    );
  }

  return {
    ...(data as SaleDocumentRow),
    category: normalizeSaleDocumentCategory((data as SaleDocumentRow).category) || 'OTHER',
  };
}

export async function createSaleDocumentMetadata(
  admin: SupabaseClient,
  input: {
    saleId: string;
    ctx: SaleContextForDocuments;
    userId: string;
    category: SaleDocumentCategory;
    documentType: string;
    description?: string | null;
    originalFileName: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<SaleDocumentRow> {
  if (!isUploadAllowedForCategory(input.category)) {
    throw new SaleDocumentError(
      'Documentos gerados pelo sistema são reservados para integração futura.',
      400,
    );
  }

  return insertSaleDocumentRow(admin, input);
}

/**
 * Persistência de artefatos gerados pelo sistema (ex.: Nota Promissória).
 * Não passa pelo bloqueio de upload manual de SYSTEM_GENERATED.
 */
export async function createSystemGeneratedSaleDocumentMetadata(
  admin: SupabaseClient,
  input: {
    saleId: string;
    ctx: SaleContextForDocuments;
    userId: string;
    documentType: string;
    description?: string | null;
    originalFileName: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<SaleDocumentRow> {
  return insertSaleDocumentRow(admin, {
    ...input,
    category: 'SYSTEM_GENERATED',
  });
}

export async function updateSaleDocumentDescription(
  admin: SupabaseClient,
  input: { saleId: string; documentId: string; companyId: string; description: string },
): Promise<SaleDocumentRow> {
  const { data, error } = await admin
    .from('sale_documents')
    .update({
      description: String(input.description || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.documentId)
    .eq('sale_id', input.saleId)
    .eq('company_id', input.companyId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new SaleDocumentError(`Erro ao atualizar descrição: ${error.message}`, 500);
  }
  if (!data) {
    throw new SaleDocumentError('Documento não encontrado.', 404);
  }

  return {
    ...(data as SaleDocumentRow),
    category: normalizeSaleDocumentCategory((data as SaleDocumentRow).category) || 'OTHER',
  };
}

export async function softDeleteSaleDocument(
  admin: SupabaseClient,
  input: { saleId: string; documentId: string; companyId: string },
): Promise<{ storagePath: string }> {
  const { data: existing, error: loadErr } = await admin
    .from('sale_documents')
    .select('id, storage_path, category')
    .eq('id', input.documentId)
    .eq('sale_id', input.saleId)
    .eq('company_id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();

  if (loadErr) {
    throw new SaleDocumentError(`Erro ao localizar documento: ${loadErr.message}`, 500);
  }
  if (!existing) {
    throw new SaleDocumentError('Documento não encontrado.', 404);
  }

  const category = normalizeSaleDocumentCategory(existing.category);
  if (category === 'SYSTEM_GENERATED') {
    throw new SaleDocumentError(
      'Documentos gerados pelo sistema não podem ser excluídos nesta fase.',
      400,
    );
  }

  const { error } = await admin
    .from('sale_documents')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.documentId);

  if (error) {
    throw new SaleDocumentError(`Erro ao excluir documento: ${error.message}`, 500);
  }

  return { storagePath: String(existing.storage_path) };
}

export async function removeSaleDocumentStorageObject(
  admin: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const path = String(storagePath || '').trim();
  if (!path) return;
  const { error } = await admin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .remove([path]);
  if (error) {
    console.warn('[sale-documents] storage remove', error.message);
  }
}

export async function createSaleDocumentSignedUrl(
  admin: SupabaseClient,
  input: { saleId: string; documentId: string; companyId: string; expiresIn?: number },
): Promise<{ url: string; fileName: string; mimeType: string }> {
  const { data, error } = await admin
    .from('sale_documents')
    .select('storage_path, original_file_name, mime_type')
    .eq('id', input.documentId)
    .eq('sale_id', input.saleId)
    .eq('company_id', input.companyId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new SaleDocumentError(`Erro ao localizar documento: ${error.message}`, 500);
  }
  if (!data) {
    throw new SaleDocumentError('Documento não encontrado.', 404);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(String(data.storage_path), input.expiresIn ?? 60 * 10);

  if (signErr || !signed?.signedUrl) {
    throw new SaleDocumentError(
      signErr?.message || 'Não foi possível gerar URL do arquivo.',
      500,
    );
  }

  return {
    url: signed.signedUrl,
    fileName: String(data.original_file_name),
    mimeType: String(data.mime_type),
  };
}

export function buildUploadStoragePathForSale(input: {
  ctx: SaleContextForDocuments;
  saleId: string;
  category: SaleDocumentCategory;
  fileName: string;
  fileId?: string;
}): string {
  return buildSaleDocumentStoragePath({
    companyId: input.ctx.companyId,
    projectId: input.ctx.projectId,
    saleId: input.saleId,
    category: input.category,
    fileName: input.fileName,
    fileId: input.fileId,
  });
}
