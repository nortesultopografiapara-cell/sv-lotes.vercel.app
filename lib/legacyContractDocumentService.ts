/**
 * Contratos antigos — consulta e URL segura para PDFs migrados.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_CONTRACTS_STORAGE_BUCKET } from '@/lib/imports/modules/legacy-contracts/constants';
import { normalizeLegacyContractStoragePath } from '@/lib/legacy-contracts/storagePathAccess';
import { resolveCallerProfile } from '@/lib/supabase/server';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export class LegacyContractDocumentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LegacyContractDocumentError';
    this.status = status;
  }
}

export type LegacyContractDocumentView = {
  id: string;
  sale_id: string;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  original_file_name: string;
  notes: string | null;
  created_at: string;
};

export async function assertLegacyContractSaleAccess(
  admin: SupabaseClient,
  saleId: string,
  userId: string,
): Promise<{ tenantId: string; saleProjectId: string | null }> {
  const profile = await resolveCallerProfile(admin, userId);
  if (!profile) {
    throw new LegacyContractDocumentError('Perfil de usuário não encontrado.', 403);
  }

  const callerRole = String(profile.role || '').toUpperCase();
  const callerTenant = String(profile.tenant_id || (profile as { company_id?: string }).company_id || '');

  const { data: sale, error: saleError } = await admin
    .from('sales')
    .select('id, tenant_id, company_id, project_id')
    .eq('id', saleId)
    .maybeSingle();

  if (saleError) {
    throw new LegacyContractDocumentError(`Erro ao localizar venda: ${saleError.message}`, 500);
  }
  if (!sale) {
    throw new LegacyContractDocumentError('Venda não encontrada.', 404);
  }

  const saleTenant = String(sale.tenant_id || sale.company_id || '');
  const isSuperAdmin = PLATFORM_ADMIN_ROLES.has(callerRole);

  if (!isSuperAdmin && callerTenant && saleTenant && callerTenant !== saleTenant) {
    throw new LegacyContractDocumentError('Sem permissão para esta venda.', 403);
  }

  return {
    tenantId: saleTenant || callerTenant,
    saleProjectId: sale.project_id ? String(sale.project_id) : null,
  };
}

export async function loadLegacyContractDocumentBySaleId(
  admin: SupabaseClient,
  saleId: string,
): Promise<(LegacyContractDocumentView & { storage_path: string; company_id: string }) | null> {
  const selectColumns =
    'id, sale_id, contract_number, contract_date, status, original_file_name, notes, storage_path, company_id, created_at, link_type, quadra, lote';

  let { data, error } = await admin
    .from('legacy_contract_documents')
    .select(selectColumns)
    .eq('sale_id', saleId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error && /link_type|is_active|deleted_at|quadra|lote/i.test(error.message)) {
    ({ data, error } = await admin
      .from('legacy_contract_documents')
      .select(
        'id, sale_id, contract_number, contract_date, status, original_file_name, notes, storage_path, company_id, created_at',
      )
      .eq('sale_id', saleId)
      .maybeSingle());
  } else if (error) {
    throw new LegacyContractDocumentError(
      `Erro ao consultar contrato antigo: ${error.message}`,
      500,
    );
  }

  if (!data) return null;

  return {
    id: String(data.id),
    sale_id: String(data.sale_id),
    contract_number: data.contract_number ? String(data.contract_number) : null,
    contract_date: data.contract_date ? String(data.contract_date) : null,
    status: String(data.status || 'ANTIGO'),
    original_file_name: String(data.original_file_name || ''),
    notes: data.notes ? String(data.notes) : null,
    created_at: String(data.created_at || ''),
    storage_path: String(data.storage_path || ''),
    company_id: String(data.company_id || ''),
  };
}

export async function createLegacyContractSignedPdfUrl(
  admin: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const normalizedPath = normalizeLegacyContractStoragePath(storagePath);
  if (!normalizedPath) {
    throw new LegacyContractDocumentError('Caminho do PDF ausente.', 404);
  }

  const { data, error } = await admin.storage
    .from(LEGACY_CONTRACTS_STORAGE_BUCKET)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    const message = error?.message || '';
    if (/not found|object not found|does not exist|no such key/i.test(message)) {
      throw new LegacyContractDocumentError('PDF não encontrado no armazenamento.', 404);
    }
    throw new LegacyContractDocumentError(
      message || 'Não foi possível gerar URL segura para o PDF.',
      404,
    );
  }

  return data.signedUrl;
}

export function toLegacyContractDocumentView(
  row: LegacyContractDocumentView & { storage_path?: string; company_id?: string },
): LegacyContractDocumentView {
  return {
    id: row.id,
    sale_id: row.sale_id,
    contract_number: row.contract_number,
    contract_date: row.contract_date,
    status: row.status,
    original_file_name: row.original_file_name,
    notes: row.notes,
    created_at: row.created_at,
  };
}
