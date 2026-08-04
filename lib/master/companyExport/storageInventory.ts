/**
 * Inventário de arquivos Storage para F2 + validação de vínculo multi-tenant.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMPANY_EXPORT_STORAGE_SOURCES,
  type StorageFileCategory,
  type StorageSourceSpec,
} from '@/lib/master/companyExport/storageRegistry';
import {
  folderContract,
  folderCustomer,
  folderProject,
  folderSale,
  sanitizeFolderName,
} from '@/lib/master/companyExport/friendlyNames';

export type InventoriesParentIds = {
  companyId: string;
  projectIds: Set<string>;
  saleIds: Set<string>;
  contractIds: Set<string>;
  customerIds: Set<string>;
};

export type StorageInventoryItem = {
  key: string;
  sourceId: string;
  bucket: string | null;
  sourcePath: string;
  destinationPath: string;
  category: StorageFileCategory;
  relatedCompanyId: string;
  relatedProjectId: string | null;
  relatedSaleId: string | null;
  relatedContractId: string | null;
  relatedCustomerId: string | null;
  originalName: string;
  mimeType: string | null;
  size: number | null;
  externalReferenceOnly: boolean;
  status: 'pending' | 'copied' | 'missing' | 'unresolved' | 'skipped_external';
};

export type ExternalAsaasRef = {
  chargeId: string;
  bankSlipUrl: string | null;
  invoiceUrl: string | null;
  status: string | null;
  dueDate: string | null;
  value: number | null;
  externalReferenceOnly: true;
};

function extractStoragePathFromUrl(raw: string, companyId: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Already a storage path (no scheme)
  if (!/^https?:\/\//i.test(s)) {
    return s.replace(/^\/+/, '');
  }
  // Public or signed Supabase URL — extract object path after /object/(public|sign)/bucket/
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/i);
  if (m) {
    return decodeURIComponent(m[2]);
  }
  // Fallback: if URL contains companyId segment, take from there
  const idx = s.indexOf(companyId);
  if (idx >= 0) {
    const rest = s.slice(idx).split('?')[0];
    return rest;
  }
  return null;
}

function pathBelongsToCompany(path: string, companyId: string): boolean {
  const p = path.replace(/^\/+/, '');
  if (p.startsWith(`${companyId}/`)) return true;
  if (p.startsWith(`contracts/saas/${companyId}/`)) return true;
  if (p.startsWith(`contracts/sale-signed/${companyId}/`)) return true;
  return false;
}

export function proveStorageLink(
  item: {
    companyId?: string | null;
    tenantId?: string | null;
    projectId?: string | null;
    saleId?: string | null;
    contractId?: string | null;
    customerId?: string | null;
    path?: string | null;
  },
  parents: InventoriesParentIds,
): boolean {
  const cid = parents.companyId;
  if (item.companyId && String(item.companyId) === cid) return true;
  if (item.tenantId && String(item.tenantId) === cid) return true;
  if (item.projectId && parents.projectIds.has(String(item.projectId))) return true;
  if (item.saleId && parents.saleIds.has(String(item.saleId))) return true;
  if (item.contractId && parents.contractIds.has(String(item.contractId))) return true;
  if (item.customerId && parents.customerIds.has(String(item.customerId))) return true;
  if (item.path && pathBelongsToCompany(String(item.path), cid)) return true;
  return false;
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'file';
}

function destForSaleDoc(
  category: string,
  saleFolder: string,
  customerFolder: string | null,
  fileName: string,
): string {
  const cat = String(category || 'OTHER').toUpperCase();
  if (cat === 'BUYER' && customerFolder) {
    return `02_clientes/${customerFolder}/documentos/${fileName}`;
  }
  if (cat === 'SPOUSE' && customerFolder) {
    return `02_clientes/${customerFolder}/conjuge/${fileName}`;
  }
  return `05_vendas/${saleFolder}/documentos/${fileName}`;
}

export async function buildStorageInventory(
  admin: SupabaseClient,
  parents: InventoriesParentIds,
  nameMaps: {
    projects: Record<string, string>;
    customers: Record<string, string>;
    contracts: Record<string, string>;
    salesMeta: Record<
      string,
      { projectName?: string; quadra?: string; lote?: string; customerId?: string }
    >;
  },
): Promise<{
  items: StorageInventoryItem[];
  unresolved: StorageInventoryItem[];
  asaasRefs: ExternalAsaasRef[];
  warnings: string[];
}> {
  const items: StorageInventoryItem[] = [];
  const unresolved: StorageInventoryItem[] = [];
  const asaasRefs: ExternalAsaasRef[] = [];
  const warnings: string[] = [];
  const seenKeys = new Set<string>();

  const pushItem = (item: StorageInventoryItem, ok: boolean) => {
    const key = item.key;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    if (ok) items.push(item);
    else unresolved.push({ ...item, status: 'unresolved' });
  };

  for (const src of COMPANY_EXPORT_STORAGE_SOURCES) {
    if (src.externalReferenceOnly) {
      await collectAsaas(admin, parents.companyId, src, asaasRefs, warnings);
      continue;
    }
    if (!src.table || !src.bucket || !src.pathColumns?.length) continue;

    if (src.id === 'company_branding') {
      const { data } = await admin
        .from('companies')
        .select('id, logo_url, signature_url, company_stamp_url, technical_signature_url, technical_stamp_url')
        .eq('id', parents.companyId)
        .maybeSingle();
      if (!data) continue;
      for (const col of src.pathColumns) {
        const raw = String((data as Record<string, unknown>)[col] || '').trim();
        if (!raw) continue;
        const path = extractStoragePathFromUrl(raw, parents.companyId);
        if (!path) continue;
        const ok = proveStorageLink(
          { companyId: parents.companyId, path },
          parents,
        );
        const name = basename(path);
        pushItem(
          {
            key: `${src.bucket}:${path}`,
            sourceId: src.id,
            bucket: src.bucket,
            sourcePath: path,
            destinationPath: `${src.zipFolderTemplate}/${sanitizeFolderName(col)}_${name}`,
            category: src.category,
            relatedCompanyId: parents.companyId,
            relatedProjectId: null,
            relatedSaleId: null,
            relatedContractId: null,
            relatedCustomerId: null,
            originalName: name,
            mimeType: null,
            size: null,
            externalReferenceOnly: false,
            status: 'pending',
          },
          ok,
        );
      }
      continue;
    }

    if (src.id === 'saas_contracts') {
      const { data } = await admin
        .from('company_contracts')
        .select('id, company_id, contract_number, contract_url, pdf_signed_url')
        .eq('company_id', parents.companyId)
        .limit(200);
      for (const row of (data as Record<string, unknown>[] | null) ?? []) {
        for (const col of src.pathColumns) {
          const raw = String(row[col] || '').trim();
          if (!raw) continue;
          const path = extractStoragePathFromUrl(raw, parents.companyId);
          if (!path) continue;
          const ok = proveStorageLink(
            { companyId: String(row.company_id || ''), path },
            parents,
          );
          const name = basename(path);
          pushItem(
            {
              key: `${src.bucket}:${path}`,
              sourceId: src.id,
              bucket: src.bucket,
              sourcePath: path,
              destinationPath: `${src.zipFolderTemplate}/${name}`,
              category: src.category,
              relatedCompanyId: parents.companyId,
              relatedProjectId: null,
              relatedSaleId: null,
              relatedContractId: String(row.id || ''),
              relatedCustomerId: null,
              originalName: name,
              mimeType: 'application/pdf',
              size: null,
              externalReferenceOnly: false,
              status: 'pending',
            },
            ok,
          );
        }
      }
      continue;
    }

    if (src.id === 'sale_signed_pdfs') {
      if (parents.contractIds.size === 0) continue;
      const ids = [...parents.contractIds].slice(0, 500);
      const { data } = await admin
        .from('contracts')
        .select('id, tenant_id, company_id, contract_number, pdf_signed_url, pdf_url')
        .in('id', ids);
      for (const row of (data as Record<string, unknown>[] | null) ?? []) {
        for (const col of src.pathColumns!) {
          const raw = String(row[col] || '').trim();
          if (!raw) continue;
          const path = extractStoragePathFromUrl(raw, parents.companyId);
          if (!path) continue;
          const ok = proveStorageLink(
            {
              companyId: row.company_id ? String(row.company_id) : null,
              tenantId: row.tenant_id ? String(row.tenant_id) : null,
              contractId: String(row.id),
              path,
            },
            parents,
          );
          const folder = folderContract(
            String(row.contract_number || nameMaps.contracts[String(row.id)] || ''),
            String(row.id),
          );
          const name = basename(path);
          const destName =
            col === 'pdf_signed_url' ? 'contrato_assinado.pdf' : 'contrato.pdf';
          pushItem(
            {
              key: `${src.bucket}:${path}`,
              sourceId: src.id,
              bucket: src.bucket,
              sourcePath: path,
              destinationPath: `06_contratos/${folder}/${destName}`,
              category: src.category,
              relatedCompanyId: parents.companyId,
              relatedProjectId: null,
              relatedSaleId: null,
              relatedContractId: String(row.id),
              relatedCustomerId: null,
              originalName: name,
              mimeType: 'application/pdf',
              size: null,
              externalReferenceOnly: false,
              status: 'pending',
            },
            ok,
          );
        }
      }
      continue;
    }

    if (src.id === 'sale_documents') {
      const { data } = await admin
        .from('sale_documents')
        .select(
          'id, company_id, tenant_id, project_id, sale_id, buyer_id, category, original_file_name, storage_path, mime_type, file_size, deleted_at',
        )
        .or(`company_id.eq.${parents.companyId},tenant_id.eq.${parents.companyId}`)
        .is('deleted_at', null)
        .limit(2000);
      for (const row of (data as Record<string, unknown>[] | null) ?? []) {
        const path = String(row.storage_path || '').trim();
        if (!path) continue;
        const saleId = String(row.sale_id || '');
        const ok = proveStorageLink(
          {
            companyId: row.company_id ? String(row.company_id) : null,
            tenantId: row.tenant_id ? String(row.tenant_id) : null,
            projectId: row.project_id ? String(row.project_id) : null,
            saleId,
            customerId: row.buyer_id ? String(row.buyer_id) : null,
            path,
          },
          parents,
        );
        const meta = nameMaps.salesMeta[saleId] || {};
        const saleFolder = folderSale({
          projectName: meta.projectName,
          quadra: meta.quadra,
          lote: meta.lote,
          saleId: saleId || String(row.id),
        });
        const customerId = String(row.buyer_id || meta.customerId || '');
        const customerFolder = customerId
          ? folderCustomer(nameMaps.customers[customerId], customerId)
          : null;
        const fileName = sanitizeFolderName(
          String(row.original_file_name || basename(path)),
          100,
        );
        pushItem(
          {
            key: `${src.bucket}:${path}`,
            sourceId: src.id,
            bucket: src.bucket!,
            sourcePath: path,
            destinationPath: destForSaleDoc(
              String(row.category || ''),
              saleFolder,
              customerFolder,
              fileName,
            ),
            category: src.category,
            relatedCompanyId: parents.companyId,
            relatedProjectId: row.project_id ? String(row.project_id) : null,
            relatedSaleId: saleId || null,
            relatedContractId: null,
            relatedCustomerId: customerId || null,
            originalName: String(row.original_file_name || fileName),
            mimeType: row.mime_type ? String(row.mime_type) : null,
            size: row.file_size != null ? Number(row.file_size) : null,
            externalReferenceOnly: false,
            status: 'pending',
          },
          ok,
        );
      }
      continue;
    }

    if (src.id === 'legacy_contracts') {
      const { data } = await admin
        .from('legacy_contract_documents')
        .select(
          'id, company_id, tenant_id, project_id, sale_id, storage_path, original_file_name, mime_type, file_size',
        )
        .or(`company_id.eq.${parents.companyId},tenant_id.eq.${parents.companyId}`)
        .limit(2000);
      for (const row of (data as Record<string, unknown>[] | null) ?? []) {
        const path = String(row.storage_path || '').trim();
        if (!path) continue;
        const ok = proveStorageLink(
          {
            companyId: row.company_id ? String(row.company_id) : null,
            tenantId: row.tenant_id ? String(row.tenant_id) : null,
            projectId: row.project_id ? String(row.project_id) : null,
            saleId: row.sale_id ? String(row.sale_id) : null,
            path,
          },
          parents,
        );
        const name = sanitizeFolderName(
          String(row.original_file_name || basename(path)),
          100,
        );
        pushItem(
          {
            key: `${src.bucket}:${path}`,
            sourceId: src.id,
            bucket: src.bucket!,
            sourcePath: path,
            destinationPath: `08_arquivos_originais/legacy/${name}`,
            category: src.category,
            relatedCompanyId: parents.companyId,
            relatedProjectId: row.project_id ? String(row.project_id) : null,
            relatedSaleId: row.sale_id ? String(row.sale_id) : null,
            relatedContractId: null,
            relatedCustomerId: null,
            originalName: String(row.original_file_name || name),
            mimeType: row.mime_type ? String(row.mime_type) : null,
            size: row.file_size != null ? Number(row.file_size) : null,
            externalReferenceOnly: false,
            status: 'pending',
          },
          ok,
        );
      }
    }
  }

  // Original implantation files — never invent
  warnings.push(
    'O arquivo original de implantação não estava armazenado no sistema.',
  );

  return { items, unresolved, asaasRefs, warnings };
}

async function collectAsaas(
  admin: SupabaseClient,
  companyId: string,
  _src: StorageSourceSpec,
  out: ExternalAsaasRef[],
  warnings: string[],
): Promise<void> {
  const { data, error } = await admin
    .from('company_asaas_charges')
    .select('id, bank_slip_url, invoice_url, status, due_date, value')
    .eq('company_id', companyId)
    .limit(2000);
  if (error) {
    warnings.push(`asaas_index: ${error.message.slice(0, 160)}`);
    return;
  }
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    out.push({
      chargeId: String(row.id),
      bankSlipUrl: row.bank_slip_url ? String(row.bank_slip_url) : null,
      invoiceUrl: row.invoice_url ? String(row.invoice_url) : null,
      status: row.status ? String(row.status) : null,
      dueDate: row.due_date ? String(row.due_date) : null,
      value: row.value != null ? Number(row.value) : null,
      externalReferenceOnly: true,
    });
  }
}

export { extractStoragePathFromUrl, pathBelongsToCompany, folderProject };
