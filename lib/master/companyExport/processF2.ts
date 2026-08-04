/**
 * Fases F2 do worker de exportação (após geojson_blocks, antes do readme).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildStorageInventory,
  type StorageInventoryItem,
} from '@/lib/master/companyExport/storageInventory';
import { copyInventoryItemToStaging } from '@/lib/master/companyExport/storageCopy';
import {
  blockHasValidGeometry,
  generateGeneralPlanForProject,
  generateLotPlanForBlock,
  generateMemorialForBlock,
  type BlockPlanTarget,
} from '@/lib/master/companyExport/generatePlans';
import {
  COMPANY_EXPORT_BINARY_BATCH,
  COMPANY_EXPORT_PLAN_BATCH,
} from '@/lib/master/companyExport/storageRegistry';
import { exportStagingFilePath } from '@/lib/master/companyExport/storagePaths';
import { COMPANY_EXPORT_BUCKET } from '@/lib/master/companyExport/types';
import type { CompanyExportStepCursor } from '@/lib/master/companyExport/types';
import { normalizeExportOptions } from '@/lib/master/companyExport/types';

const INVENTORY_REL = '_meta/storage_inventory.json';
const FILE_INDEX_REL = '_meta/file_index.json';
const ASAAS_REL = '07_financeiro/boletos_asaas_index.csv';
const RESTORE_REL = '99_RESTAURACAO/instrucoes_de_importacao.txt';

type ParentIds = {
  saleIds: string[];
  projectIds: string[];
  blockIds: string[];
  contractIds: string[];
  customerIds: string[];
};

async function uploadText(
  admin: SupabaseClient,
  path: string,
  content: string,
  contentType: string,
): Promise<{ ok: boolean; size: number; error?: string }> {
  const body = Buffer.from(content, 'utf8');
  const { error } = await admin.storage.from(COMPANY_EXPORT_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) return { ok: false, size: 0, error: error.message };
  return { ok: true, size: body.length };
}

async function loadInventory(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
): Promise<StorageInventoryItem[]> {
  const path = exportStagingFilePath(companyId, exportId, INVENTORY_REL);
  const { data, error } = await admin.storage.from(COMPANY_EXPORT_BUCKET).download(path);
  if (error || !data) return [];
  const text = await data.text();
  try {
    const parsed = JSON.parse(text) as { items?: StorageInventoryItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function ensureF2Arrays(cursor: CompanyExportStepCursor): void {
  if (!cursor.copiedKeys) cursor.copiedKeys = [];
  if (!cursor.generatedKeys) cursor.generatedKeys = [];
  if (!cursor.missingFiles) cursor.missingFiles = [];
  if (!cursor.unresolvedFiles) cursor.unresolvedFiles = [];
  if (!cursor.generationErrors) cursor.generationErrors = [];
  if (!cursor.fileChecksums) cursor.fileChecksums = {};
  if (!cursor.asaasRefs) cursor.asaasRefs = [];
}

function trackFile(cursor: CompanyExportStepCursor, rel: string, bytes: number): number {
  if (!cursor.files.includes(rel)) {
    cursor.files.push(rel);
    return bytes;
  }
  return 0;
}

async function loadNameMaps(
  admin: SupabaseClient,
  companyId: string,
  parentIds: ParentIds,
): Promise<{
  projects: Record<string, string>;
  customers: Record<string, string>;
  contracts: Record<string, string>;
  salesMeta: Record<
    string,
    { projectName?: string; quadra?: string; lote?: string; customerId?: string }
  >;
}> {
  const projects: Record<string, string> = {};
  const customers: Record<string, string> = {};
  const contracts: Record<string, string> = {};
  const salesMeta: Record<
    string,
    { projectName?: string; quadra?: string; lote?: string; customerId?: string }
  > = {};

  if (parentIds.projectIds.length) {
    const { data } = await admin
      .from('projects')
      .select('id, name')
      .in('id', parentIds.projectIds.slice(0, 500));
    for (const r of (data as Array<{ id: string; name: string }> | null) ?? []) {
      projects[r.id] = r.name || r.id;
    }
  }
  if (parentIds.customerIds.length) {
    const { data } = await admin
      .from('customers')
      .select('id, full_name, name')
      .in('id', parentIds.customerIds.slice(0, 500));
    for (const r of (data as Array<Record<string, unknown>> | null) ?? []) {
      customers[String(r.id)] = String(r.full_name || r.name || r.id);
    }
  }
  if (parentIds.contractIds.length) {
    const { data } = await admin
      .from('contracts')
      .select('id, contract_number')
      .in('id', parentIds.contractIds.slice(0, 500));
    for (const r of (data as Array<{ id: string; contract_number: string }> | null) ?? []) {
      contracts[r.id] = r.contract_number || r.id;
    }
  }
  if (parentIds.saleIds.length) {
    const { data } = await admin
      .from('sales')
      .select('id, project_id, customer_id, block_id')
      .in('id', parentIds.saleIds.slice(0, 500));
    for (const r of (data as Array<Record<string, unknown>> | null) ?? []) {
      const pid = r.project_id ? String(r.project_id) : '';
      salesMeta[String(r.id)] = {
        projectName: pid ? projects[pid] : undefined,
        customerId: r.customer_id ? String(r.customer_id) : undefined,
      };
    }
  }

  void companyId;
  return { projects, customers, contracts, salesMeta };
}

const COMPANY_SOURCES = new Set(['company_branding', 'saas_contracts']);
const SALE_DOC_SOURCES = new Set(['sale_documents']);
const CONTRACT_SOURCES = new Set(['sale_signed_pdfs']);
const LEGACY_SOURCES = new Set(['legacy_contracts']);

async function copyBatch(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  cursor: CompanyExportStepCursor,
  sourceFilter: Set<string>,
  filesExported: number,
  totalSize: number,
): Promise<{ filesExported: number; totalSize: number; advanced: boolean; done: boolean }> {
  ensureF2Arrays(cursor);
  const items = await loadInventory(admin, companyId, exportId);
  const filtered = items.filter((i) => sourceFilter.has(i.sourceId) && !i.externalReferenceOnly);
  const offset = cursor.copyOffset || 0;
  const batch = filtered.slice(offset, offset + COMPANY_EXPORT_BINARY_BATCH);

  if (batch.length === 0) {
    cursor.copyOffset = 0;
    return { filesExported, totalSize, advanced: false, done: true };
  }

  let fe = filesExported;
  let ts = totalSize;

  for (const item of batch) {
    if (await isExportCancelled(admin, companyId, exportId)) {
      return { filesExported: fe, totalSize: ts, advanced: true, done: true };
    }
    if (cursor.copiedKeys!.includes(item.key)) continue;
    const result = await copyInventoryItemToStaging(admin, companyId, exportId, item);
    cursor.copiedKeys!.push(item.key);
    if (result.ok && !result.missing && result.bytes > 0) {
      const added = trackFile(cursor, item.destinationPath, result.bytes);
      if (added) fe += 1;
      ts += result.bytes;
      cursor.storageFilesCopied = (cursor.storageFilesCopied || 0) + 1;
      cursor.totalBinarySize = (cursor.totalBinarySize || 0) + result.bytes;
      if (result.checksum) cursor.fileChecksums![item.destinationPath] = result.checksum;
    } else if (result.missing) {
      cursor.storageFilesMissing = (cursor.storageFilesMissing || 0) + 1;
      cursor.missingFiles!.push({
        bucket: item.bucket,
        path: item.sourcePath,
        destination: item.destinationPath,
        error: result.error || 'missing',
      });
    } else if (result.item.status === 'unresolved') {
      cursor.unresolvedFiles!.push({
        bucket: item.bucket,
        path: item.sourcePath,
        reason: result.error || 'unresolved',
      });
    }
  }

  cursor.copyOffset = offset + batch.length;
  const done = cursor.copyOffset >= filtered.length;
  if (done) cursor.copyOffset = 0;
  return { filesExported: fe, totalSize: ts, advanced: true, done };
}

async function isExportCancelled(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('company_export_jobs')
    .select('status')
    .eq('id', exportId)
    .eq('company_id', companyId)
    .maybeSingle();
  return data?.status === 'CANCELLED';
}

export type F2StepResult = {
  handled: boolean;
  done: boolean;
  failed: boolean;
  filesExported: number;
  totalSize: number;
  progress: number;
  currentStep: string;
};

export async function processF2Phase(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  cursor: CompanyExportStepCursor,
  parentIds: ParentIds,
  filesExported: number,
  totalSize: number,
): Promise<F2StepResult> {
  ensureF2Arrays(cursor);
  const options = normalizeExportOptions(cursor.options);
  cursor.options = options;

  const base = {
    handled: true as const,
    done: false,
    failed: false,
    filesExported,
    totalSize,
  };

  if (await isExportCancelled(admin, companyId, exportId)) {
    return {
      handled: true,
      done: true,
      failed: false,
      filesExported,
      totalSize,
      progress: 0,
      currentStep: 'cancelled',
    };
  }

  if (cursor.phase === 'inventory_storage') {
    const nameMaps = await loadNameMaps(admin, companyId, parentIds);
    const inv = await buildStorageInventory(
      admin,
      {
        companyId,
        projectIds: new Set(parentIds.projectIds),
        saleIds: new Set(parentIds.saleIds),
        contractIds: new Set(parentIds.contractIds),
        customerIds: new Set(parentIds.customerIds),
      },
      nameMaps,
    );

    const body = JSON.stringify(
      {
        items: inv.items,
        unresolved: inv.unresolved,
        asaasRefs: inv.asaasRefs,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    );
    const path = exportStagingFilePath(companyId, exportId, INVENTORY_REL);
    const up = await uploadText(admin, path, body, 'application/json');
    let fe = filesExported;
    let ts = totalSize;
    if (up.ok) {
      const added = trackFile(cursor, INVENTORY_REL, up.size);
      if (added) fe += 1;
      ts += up.size;
    }

    for (const w of inv.warnings) {
      if (!cursor.warnings.includes(w)) cursor.warnings.push(w);
    }
    for (const u of inv.unresolved) {
      cursor.unresolvedFiles!.push({
        bucket: u.bucket,
        path: u.sourcePath,
        reason: 'vínculo multi-tenant não comprovado',
      });
    }

    cursor.asaasRefs = inv.asaasRefs as unknown as Array<Record<string, unknown>>;
    cursor.storageFilesFound = inv.items.length;
    cursor.storageFilesDeduplicated = 0;
    cursor.originalSourceFileStatus = 'NOT_PERSISTED';
    cursor.copyOffset = 0;
    cursor.phase = 'copy_company_files';

    // Seed plan targets for later (geometry-valid blocks)
    const { data: blocks } = await admin
      .from('blocks')
      .select('id, project_id, block_name, lot_number, number, segments_json, geometry')
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .limit(3000);
    const targets: BlockPlanTarget[] = [];
    for (const row of (blocks as Record<string, unknown>[] | null) ?? []) {
      if (!blockHasValidGeometry(row)) continue;
      targets.push({
        id: String(row.id),
        project_id: String(row.project_id || ''),
        block_name: row.block_name != null ? String(row.block_name) : null,
        lot_number: row.lot_number != null ? String(row.lot_number) : null,
        number: row.number != null ? String(row.number) : null,
      });
    }
    cursor.planTargets = targets;
    cursor.projectTargets = Object.entries(nameMaps.projects).map(([id, name]) => ({
      id,
      name,
    }));
    cursor.memorialOffset = 0;
    cursor.lotPlanOffset = 0;
    cursor.generalPlanOffset = 0;

    return {
      ...base,
      filesExported: fe,
      totalSize: ts,
      progress: 91,
      currentStep: 'inventory_storage',
    };
  }

  if (cursor.phase === 'copy_company_files') {
    const r = await copyBatch(
      admin,
      companyId,
      exportId,
      cursor,
      COMPANY_SOURCES,
      filesExported,
      totalSize,
    );
    if (r.done) cursor.phase = 'copy_sale_documents';
    return {
      ...base,
      filesExported: r.filesExported,
      totalSize: r.totalSize,
      progress: 92,
      currentStep: 'copy_company_files',
    };
  }

  if (cursor.phase === 'copy_sale_documents') {
    const r = await copyBatch(
      admin,
      companyId,
      exportId,
      cursor,
      SALE_DOC_SOURCES,
      filesExported,
      totalSize,
    );
    if (r.done) cursor.phase = 'copy_contract_files';
    return {
      ...base,
      filesExported: r.filesExported,
      totalSize: r.totalSize,
      progress: 93,
      currentStep: 'copy_sale_documents',
    };
  }

  if (cursor.phase === 'copy_contract_files') {
    const r = await copyBatch(
      admin,
      companyId,
      exportId,
      cursor,
      CONTRACT_SOURCES,
      filesExported,
      totalSize,
    );
    if (r.done) cursor.phase = 'copy_legacy_contracts';
    return {
      ...base,
      filesExported: r.filesExported,
      totalSize: r.totalSize,
      progress: 93,
      currentStep: 'copy_contract_files',
    };
  }

  if (cursor.phase === 'copy_legacy_contracts') {
    const r = await copyBatch(
      admin,
      companyId,
      exportId,
      cursor,
      LEGACY_SOURCES,
      filesExported,
      totalSize,
    );
    if (r.done) {
      cursor.phase = options.include_generated_plans
        ? 'generate_memorials'
        : 'build_file_index';
      if (!options.include_generated_plans) {
        cursor.warnings.push(
          'Memoriais e pranchas não foram regenerados (opção include_generated_plans=false).',
        );
      }
    }
    return {
      ...base,
      filesExported: r.filesExported,
      totalSize: r.totalSize,
      progress: 94,
      currentStep: 'copy_legacy_contracts',
    };
  }

  if (cursor.phase === 'generate_memorials') {
    const targets = cursor.planTargets || [];
    const projects = Object.fromEntries(
      (cursor.projectTargets || []).map((p) => [p.id, p.name]),
    );
    const offset = cursor.memorialOffset || 0;
    const batch = targets.slice(offset, offset + COMPANY_EXPORT_PLAN_BATCH);
    let fe = filesExported;
    let ts = totalSize;

    if (batch.length === 0) {
      cursor.phase = 'generate_lot_plans';
      cursor.memorialOffset = 0;
    } else {
      for (const block of batch) {
        if (await isExportCancelled(admin, companyId, exportId)) {
          return {
            ...base,
            filesExported: fe,
            totalSize: ts,
            progress: 95,
            currentStep: 'cancelled',
            done: true,
          };
        }
        const key = `memorial:${block.id}`;
        if (cursor.generatedKeys!.includes(key)) continue;
        const projectName = projects[block.project_id] || block.project_id;
        const result = await generateMemorialForBlock(
          admin,
          companyId,
          exportId,
          block,
          projectName,
        );
        cursor.generatedKeys!.push(key);
        if (result.ok) {
          const added = trackFile(cursor, result.rel, result.bytes);
          if (added) fe += 1;
          ts += result.bytes;
          cursor.generatedMemorials = (cursor.generatedMemorials || 0) + 1;
          cursor.totalBinarySize = (cursor.totalBinarySize || 0) + result.bytes;
          cursor.fileChecksums![result.rel] = result.checksum;
        } else {
          cursor.generationErrors!.push(result.error as unknown as Record<string, unknown>);
        }
      }
      cursor.memorialOffset = offset + batch.length;
      if (cursor.memorialOffset >= targets.length) {
        cursor.phase = 'generate_lot_plans';
        cursor.memorialOffset = 0;
      }
    }

    return {
      ...base,
      filesExported: fe,
      totalSize: ts,
      progress: 95,
      currentStep: 'generate_memorials',
    };
  }

  if (cursor.phase === 'generate_lot_plans') {
    const targets = cursor.planTargets || [];
    const projects = Object.fromEntries(
      (cursor.projectTargets || []).map((p) => [p.id, p.name]),
    );
    const offset = cursor.lotPlanOffset || 0;
    const batch = targets.slice(offset, offset + COMPANY_EXPORT_PLAN_BATCH);
    let fe = filesExported;
    let ts = totalSize;

    if (batch.length === 0) {
      cursor.phase = 'generate_general_plans';
      cursor.lotPlanOffset = 0;
    } else {
      for (const block of batch) {
        if (await isExportCancelled(admin, companyId, exportId)) {
          return {
            ...base,
            filesExported: fe,
            totalSize: ts,
            progress: 96,
            currentStep: 'cancelled',
            done: true,
          };
        }
        const key = `lot_plan:${block.id}`;
        if (cursor.generatedKeys!.includes(key)) continue;
        const projectName = projects[block.project_id] || block.project_id;
        const result = await generateLotPlanForBlock(
          admin,
          companyId,
          exportId,
          block,
          projectName,
        );
        cursor.generatedKeys!.push(key);
        if (result.ok) {
          const added = trackFile(cursor, result.rel, result.bytes);
          if (added) fe += 1;
          ts += result.bytes;
          cursor.generatedLotPlans = (cursor.generatedLotPlans || 0) + 1;
          cursor.totalBinarySize = (cursor.totalBinarySize || 0) + result.bytes;
          cursor.fileChecksums![result.rel] = result.checksum;
        } else {
          cursor.generationErrors!.push(result.error as unknown as Record<string, unknown>);
        }
      }
      cursor.lotPlanOffset = offset + batch.length;
      if (cursor.lotPlanOffset >= targets.length) {
        cursor.phase = 'generate_general_plans';
        cursor.lotPlanOffset = 0;
      }
    }

    return {
      ...base,
      filesExported: fe,
      totalSize: ts,
      progress: 96,
      currentStep: 'generate_lot_plans',
    };
  }

  if (cursor.phase === 'generate_general_plans') {
    const projects = cursor.projectTargets || [];
    const offset = cursor.generalPlanOffset || 0;
    const batch = projects.slice(offset, offset + 1);
    let fe = filesExported;
    let ts = totalSize;

    if (batch.length === 0) {
      cursor.phase = 'build_file_index';
      cursor.generalPlanOffset = 0;
    } else {
      for (const project of batch) {
        const key = `general:${project.id}`;
        if (cursor.generatedKeys!.includes(key)) continue;
        const result = await generateGeneralPlanForProject(
          admin,
          companyId,
          exportId,
          project.id,
          project.name,
        );
        cursor.generatedKeys!.push(key);
        if (result.ok) {
          const added = trackFile(cursor, result.rel, result.bytes);
          if (added) fe += 1;
          ts += result.bytes;
          cursor.generatedGeneralPlans = (cursor.generatedGeneralPlans || 0) + 1;
          cursor.totalBinarySize = (cursor.totalBinarySize || 0) + result.bytes;
          cursor.fileChecksums![result.rel] = result.checksum;
        } else {
          cursor.generationErrors!.push(result.error as unknown as Record<string, unknown>);
        }
      }
      cursor.generalPlanOffset = offset + batch.length;
      if (cursor.generalPlanOffset >= projects.length) {
        cursor.phase = 'build_file_index';
        cursor.generalPlanOffset = 0;
      }
    }

    return {
      ...base,
      filesExported: fe,
      totalSize: ts,
      progress: 96,
      currentStep: 'generate_general_plans',
    };
  }

  if (cursor.phase === 'build_file_index') {
    let fe = filesExported;
    let ts = totalSize;

    // Asaas CSV index
    const asaas = cursor.asaasRefs || [];
    if (asaas.length) {
      const header =
        'charge_id,bank_slip_url,invoice_url,status,due_date,value,external_reference_only\n';
      const lines = asaas.map((r) => {
        const o = r as Record<string, unknown>;
        return [
          o.chargeId ?? o.charge_id ?? '',
          o.bankSlipUrl ?? o.bank_slip_url ?? '',
          o.invoiceUrl ?? o.invoice_url ?? '',
          o.status ?? '',
          o.dueDate ?? o.due_date ?? '',
          o.value ?? '',
          'true',
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(',');
      });
      const csv = header + lines.join('\n') + '\n';
      const path = exportStagingFilePath(companyId, exportId, ASAAS_REL);
      const up = await uploadText(admin, path, csv, 'text/csv; charset=utf-8');
      if (up.ok) {
        const added = trackFile(cursor, ASAAS_REL, up.size);
        if (added) fe += 1;
        ts += up.size;
      }
    }

    const index = {
      files: cursor.files,
      storage_files_found: cursor.storageFilesFound || 0,
      storage_files_copied: cursor.storageFilesCopied || 0,
      storage_files_missing: cursor.storageFilesMissing || 0,
      missing_files: cursor.missingFiles || [],
      unresolved_files: cursor.unresolvedFiles || [],
      generation_errors: cursor.generationErrors || [],
      generated_memorials: cursor.generatedMemorials || 0,
      generated_lot_plans: cursor.generatedLotPlans || 0,
      generated_general_plans: cursor.generatedGeneralPlans || 0,
      original_source_file_status: cursor.originalSourceFileStatus || 'NOT_PERSISTED',
      asaas_refs_count: (cursor.asaasRefs || []).length,
    };
    const indexPath = exportStagingFilePath(companyId, exportId, FILE_INDEX_REL);
    const indexUp = await uploadText(
      admin,
      indexPath,
      JSON.stringify(index, null, 2),
      'application/json',
    );
    if (indexUp.ok) {
      const added = trackFile(cursor, FILE_INDEX_REL, indexUp.size);
      if (added) fe += 1;
      ts += indexUp.size;
    }

    const restore = [
      'INSTRUÇÕES DE RESTAURAÇÃO / REIMPORTAÇÃO — SV LOTES',
      '',
      'Este pacote NÃO inclui restore automático.',
      'Use-o como backup documental e base para migração assistida.',
      '',
      '1. Valide checksums.sha256 antes de usar os arquivos.',
      '2. Dados tabulares: CSV/JSON nas pastas 01–09.',
      '3. Binários: pastas amigáveis (clientes, vendas, contratos, empreendimentos).',
      '4. Memoriais/pranchas (se presentes) foram REGENERADOS no momento da exportação;',
      '   não são cópia de arquivos persistidos no cadastro operacional.',
      '5. Boletos Asaas: apenas URLs/metadados (external_reference_only).',
      '6. Arquivo original de implantação (TXT/KML/GeoJSON): status NOT_PERSISTED',
      '   se o sistema não armazenava o binário original.',
      '7. Contate o suporte SV LOTES para qualquer reimportação em produção.',
      '',
    ].join('\n');
    const restorePath = exportStagingFilePath(companyId, exportId, RESTORE_REL);
    const restoreUp = await uploadText(
      admin,
      restorePath,
      restore,
      'text/plain; charset=utf-8',
    );
    if (restoreUp.ok) {
      const added = trackFile(cursor, RESTORE_REL, restoreUp.size);
      if (added) fe += 1;
      ts += restoreUp.size;
    }

    cursor.phase = 'readme';
    return {
      ...base,
      filesExported: fe,
      totalSize: ts,
      progress: 96,
      currentStep: 'build_file_index',
    };
  }

  return {
    handled: false,
    done: false,
    failed: false,
    filesExported,
    totalSize,
    progress: 0,
    currentStep: cursor.phase,
  };
}

export function isF2Phase(phase: string): boolean {
  return (
    phase === 'inventory_storage' ||
    phase === 'copy_company_files' ||
    phase === 'copy_sale_documents' ||
    phase === 'copy_contract_files' ||
    phase === 'copy_legacy_contracts' ||
    phase === 'generate_memorials' ||
    phase === 'generate_lot_plans' ||
    phase === 'generate_general_plans' ||
    phase === 'build_file_index'
  );
}
