import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { stripForbiddenColumns } from '@/lib/master/companyExport/denyList';
import { COMPANY_EXPORT_FORBIDDEN_TABLES } from '@/lib/master/companyExport/denyList';
import { rowsToCsv, sanitizeFilePart } from '@/lib/master/companyExport/csv';
import { COMPANY_EXPORT_TABLES } from '@/lib/master/companyExport/registry';
import {
  COMPANY_EXPORT_AUDIT,
  logCompanyExportAudit,
  reasonLabel,
} from '@/lib/master/companyExport/audit';
import {
  COMPANY_EXPORT_BUCKET,
  exportPackagePath,
  exportStagingFilePath,
} from '@/lib/master/companyExport/storagePaths';
import { buildStoredZip } from '@/lib/master/companyExport/zipStore';
import { buildExportReadmeHtml } from '@/lib/master/companyExport/readme';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import {
  COMPANY_EXPORT_PAGE_SIZE,
  COMPANY_EXPORT_SCHEMA_VERSION,
  emptyStepCursor,
  type CompanyExportJobRow,
  type CompanyExportManifest,
  type CompanyExportStepCursor,
  type CompanyExportTableSpec,
} from '@/lib/master/companyExport/types';

function parseCursor(raw: unknown): CompanyExportStepCursor {
  if (!raw || typeof raw !== 'object') return emptyStepCursor();
  const c = raw as Partial<CompanyExportStepCursor>;
  return {
    ...emptyStepCursor(),
    ...c,
    recordCounts: c.recordCounts || {},
    files: Array.isArray(c.files) ? c.files : [],
    warnings: Array.isArray(c.warnings) ? c.warnings : [],
    errors: Array.isArray(c.errors) ? c.errors : [],
    missingOptionalTables: Array.isArray(c.missingOptionalTables)
      ? c.missingOptionalTables
      : [],
  };
}

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

async function listIdColumn(
  admin: SupabaseClient,
  table: string,
  companyId: string,
  scope: 'company_or_tenant' | 'company_id' | 'tenant_id',
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = admin.from(table).select('id');
    if (scope === 'company_id') q = q.eq('company_id', companyId);
    else if (scope === 'tenant_id') q = q.eq('tenant_id', companyId);
    else q = q.or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) break;
    const rows = (data as Array<{ id: string }> | null) ?? [];
    for (const r of rows) if (r.id) ids.push(String(r.id));
    if (rows.length < page) break;
    from += page;
  }
  return ids;
}

async function fetchTablePage(
  admin: SupabaseClient,
  spec: CompanyExportTableSpec,
  companyId: string,
  offset: number,
  parentIds: {
    saleIds: string[];
    projectIds: string[];
    blockIds: string[];
    contractIds: string[];
    customerIds: string[];
  },
): Promise<{ rows: Record<string, unknown>[]; error: string | null; missing: boolean }> {
  const selectCols = [...new Set([...spec.columns, ...(spec.jsonExtraColumns || [])])].join(
    ', ',
  );
  let query = admin.from(spec.table).select(selectCols);

  switch (spec.scope) {
    case 'self_id':
      query = query.eq('id', companyId);
      break;
    case 'company_id':
      query = query.eq('company_id', companyId);
      break;
    case 'tenant_id':
      query = query.eq('tenant_id', companyId);
      break;
    case 'company_or_tenant':
      query = query.or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`);
      break;
    case 'via_sales':
      if (parentIds.saleIds.length === 0) return { rows: [], error: null, missing: false };
      query = query.in('sale_id', parentIds.saleIds.slice(0, 200));
      break;
    case 'via_projects':
      if (parentIds.projectIds.length === 0) return { rows: [], error: null, missing: false };
      query = query.in('project_id', parentIds.projectIds.slice(0, 200));
      break;
    case 'via_blocks':
      if (parentIds.blockIds.length === 0) return { rows: [], error: null, missing: false };
      query = query.or(
        [
          parentIds.blockIds.length
            ? `block_id.in.(${parentIds.blockIds.slice(0, 100).join(',')})`
            : null,
          parentIds.blockIds.length
            ? `lot_id.in.(${parentIds.blockIds.slice(0, 100).join(',')})`
            : null,
        ]
          .filter(Boolean)
          .join(','),
      );
      break;
    case 'via_contracts':
      if (parentIds.contractIds.length === 0) return { rows: [], error: null, missing: false };
      query = query.in('contract_id', parentIds.contractIds.slice(0, 200));
      break;
    case 'via_customers':
      if (parentIds.customerIds.length === 0) return { rows: [], error: null, missing: false };
      query = query.in('customer_id', parentIds.customerIds.slice(0, 200));
      break;
    default:
      return { rows: [], error: `Escopo desconhecido: ${spec.scope}`, missing: false };
  }

  const { data, error } = await query.range(offset, offset + COMPANY_EXPORT_PAGE_SIZE - 1);
  if (error) {
    const msg = error.message || '';
    if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
      return { rows: [], error: null, missing: true };
    }
    if (/column .* does not exist|Could not find.*column/i.test(msg)) {
      // retry with minimal id-only then skip extras — treat as warning
      const minimal = await admin
        .from(spec.table)
        .select(spec.columns.filter((c) => !c.includes('.')).slice(0, 8).join(', ') || 'id')
        .limit(0);
      if (minimal.error) {
        return { rows: [], error: msg, missing: Boolean(spec.optional) };
      }
      return { rows: [], error: msg, missing: false };
    }
    return { rows: [], error: msg, missing: false };
  }

  const rows = ((data as unknown as Record<string, unknown>[] | null) ?? []).map((row) =>
    stripForbiddenColumns(row, [...spec.columns, ...(spec.jsonExtraColumns || [])]),
  );
  return { rows, error: null, missing: false };
}

function blocksToGeoJson(rows: Record<string, unknown>[]): string {
  const features = rows
    .map((row) => {
      const geom =
        row.geojson ||
        row.geometry ||
        (typeof row.segments_json === 'object' ? null : null);
      if (!geom || typeof geom !== 'object') {
        return {
          type: 'Feature',
          properties: {
            id: row.id,
            project_id: row.project_id,
            block_name: row.block_name,
            lot_number: row.lot_number,
            number: row.number,
            area: row.area,
          },
          geometry: null,
        };
      }
      const g = geom as Record<string, unknown>;
      if (g.type === 'Feature') return g;
      if (g.type === 'FeatureCollection') return null;
      return {
        type: 'Feature',
        properties: { id: row.id, project_id: row.project_id },
        geometry: g,
      };
    })
    .filter(Boolean);

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features,
    },
    null,
    2,
  );
}

export async function processCompanyExportStep(
  admin: SupabaseClient,
  job: CompanyExportJobRow,
): Promise<{ done: boolean; failed: boolean }> {
  const companyId = job.company_id;
  const exportId = job.id;
  const cursor = parseCursor(job.step_cursor);

  const parentIds = {
    saleIds: [] as string[],
    projectIds: [] as string[],
    blockIds: [] as string[],
    contractIds: [] as string[],
    customerIds: [] as string[],
  };

  // Lazy-load parent IDs once when needed (cached in cursor via warnings flag isn't ideal —
  // reload each step is OK for correctness; cache on cursor for perf)
  const ensureParents = async () => {
    if ((cursor as { _parentsLoaded?: boolean })._parentsLoaded) return;
    parentIds.saleIds = await listIdColumn(admin, 'sales', companyId, 'company_or_tenant');
    parentIds.projectIds = await listIdColumn(admin, 'projects', companyId, 'company_or_tenant');
    parentIds.blockIds = await listIdColumn(admin, 'blocks', companyId, 'company_or_tenant');
    parentIds.contractIds = await listIdColumn(
      admin,
      'contracts',
      companyId,
      'company_or_tenant',
    );
    parentIds.customerIds = await listIdColumn(
      admin,
      'customers',
      companyId,
      'company_or_tenant',
    );
    (cursor as { _parentsLoaded?: boolean })._parentsLoaded = true;
    (cursor as { _parentCache?: typeof parentIds })._parentCache = { ...parentIds };
  };

  const cached = (cursor as { _parentCache?: typeof parentIds })._parentCache;
  if (cached) {
    parentIds.saleIds = cached.saleIds;
    parentIds.projectIds = cached.projectIds;
    parentIds.blockIds = cached.blockIds;
    parentIds.contractIds = cached.contractIds;
    parentIds.customerIds = cached.customerIds;
    (cursor as { _parentsLoaded?: boolean })._parentsLoaded = true;
  }

  let recordsExported = job.records_exported || 0;
  let filesExported = job.files_exported || 0;
  let totalSize = Number(job.total_size || 0);

  const totalTableSteps = COMPANY_EXPORT_TABLES.length;
  const progressForTables = () =>
    Math.min(85, Math.round(((cursor.tableIndex + 1) / (totalTableSteps + 4)) * 85));

  if (cursor.phase === 'tables') {
    if (cursor.tableIndex >= COMPANY_EXPORT_TABLES.length) {
      cursor.phase = 'contract_html';
      cursor.offset = 0;
    } else {
      const spec = COMPANY_EXPORT_TABLES[cursor.tableIndex];
      if (COMPANY_EXPORT_FORBIDDEN_TABLES.includes(spec.table as never)) {
        cursor.errors.push(`Tabela proibida ignorada: ${spec.table}`);
        cursor.tableIndex += 1;
        cursor.offset = 0;
      } else {
        if (
          spec.scope === 'via_sales' ||
          spec.scope === 'via_projects' ||
          spec.scope === 'via_blocks' ||
          spec.scope === 'via_contracts' ||
          spec.scope === 'via_customers'
        ) {
          await ensureParents();
        }

        const page = await fetchTablePage(admin, spec, companyId, cursor.offset, parentIds);
        if (page.missing) {
          cursor.missingOptionalTables.push(spec.table);
          cursor.warnings.push(`Tabela opcional ausente: ${spec.table}`);
          cursor.tableIndex += 1;
          cursor.offset = 0;
        } else if (page.error && spec.optional) {
          cursor.warnings.push(`${spec.table}: ${page.error}`);
          cursor.tableIndex += 1;
          cursor.offset = 0;
        } else if (page.error) {
          cursor.errors.push(`${spec.table}: ${page.error}`);
          // non-fatal for F1 — skip table
          cursor.tableIndex += 1;
          cursor.offset = 0;
        } else {
          const allColumns = [...spec.columns];
          const sanitized = page.rows;

          if (cursor.offset === 0 && sanitized.length === 0) {
            // still write empty csv header once
            if (spec.formats.includes('csv')) {
              const rel = `${spec.folder}/${spec.fileBase}.csv`;
              const path = exportStagingFilePath(companyId, exportId, rel);
              const csv = rowsToCsv([], allColumns);
              const up = await uploadText(admin, path, csv, 'text/csv; charset=utf-8');
              if (up.ok) {
                if (!cursor.files.includes(rel)) {
                  cursor.files.push(rel);
                  filesExported += 1;
                }
                totalSize += up.size;
              }
            }
            cursor.recordCounts[spec.id] = cursor.recordCounts[spec.id] || 0;
            cursor.tableIndex += 1;
            cursor.offset = 0;
          } else if (sanitized.length === 0) {
            cursor.tableIndex += 1;
            cursor.offset = 0;
          } else {
            cursor.recordCounts[spec.id] =
              (cursor.recordCounts[spec.id] || 0) + sanitized.length;
            recordsExported += sanitized.length;

            if (spec.formats.includes('csv')) {
              const rel = `${spec.folder}/${spec.fileBase}.csv`;
              const path = exportStagingFilePath(companyId, exportId, rel);
              // append strategy: rewrite full page files with page suffix for large tables
              const pageRel =
                cursor.offset === 0
                  ? rel
                  : `${spec.folder}/${spec.fileBase}_p${Math.floor(cursor.offset / COMPANY_EXPORT_PAGE_SIZE) + 1}.csv`;
              const pagePath = exportStagingFilePath(companyId, exportId, pageRel);
              const csv = rowsToCsv(sanitized, allColumns);
              const up = await uploadText(admin, pagePath, csv, 'text/csv; charset=utf-8');
              if (up.ok) {
                if (!cursor.files.includes(pageRel)) {
                  cursor.files.push(pageRel);
                  filesExported += 1;
                }
                totalSize += up.size;
              } else {
                cursor.warnings.push(`Falha upload ${pageRel}: ${up.error}`);
              }
            }

            if (spec.formats.includes('json') && (cursor.offset === 0 || sanitized.length > 0)) {
              const pageRel = `${spec.folder}/${spec.fileBase}_p${Math.floor(cursor.offset / COMPANY_EXPORT_PAGE_SIZE) + 1}.json`;
              const pagePath = exportStagingFilePath(companyId, exportId, pageRel);
              const json = JSON.stringify(sanitized, null, 2);
              const up = await uploadText(admin, pagePath, json, 'application/json');
              if (up.ok) {
                if (!cursor.files.includes(pageRel)) {
                  cursor.files.push(pageRel);
                  filesExported += 1;
                }
                totalSize += up.size;
              }
            }

            if (sanitized.length < COMPANY_EXPORT_PAGE_SIZE) {
              cursor.tableIndex += 1;
              cursor.offset = 0;
            } else {
              cursor.offset += COMPANY_EXPORT_PAGE_SIZE;
            }
          }
        }
      }

      await admin
        .from('company_export_jobs')
        .update({
          status: 'PROCESSING',
          progress: progressForTables(),
          current_step: `tables:${COMPANY_EXPORT_TABLES[Math.min(cursor.tableIndex, totalTableSteps - 1)]?.id || 'done'}`,
          step_cursor: cursor,
          records_exported: recordsExported,
          files_exported: filesExported,
          total_size: totalSize,
          started_at: job.started_at || new Date().toISOString(),
        })
        .eq('id', exportId)
        .eq('company_id', companyId);

      return { done: false, failed: false };
    }
  }

  if (cursor.phase === 'contract_html') {
    await ensureParents();
    const contractIds = parentIds.contractIds;
    const batch = contractIds.slice(
      cursor.contractHtmlOffset,
      cursor.contractHtmlOffset + 20,
    );
    if (batch.length === 0) {
      cursor.phase = 'geojson_blocks';
      cursor.geojsonOffset = 0;
    } else {
      const { data, error } = await admin
        .from('contracts')
        .select(
          'id, contract_number, generated_html, html_content, contract_html, content, html',
        )
        .in('id', batch);
      if (error) {
        cursor.warnings.push(`contract_html: ${error.message}`);
      } else {
        for (const row of (data as unknown as Record<string, unknown>[] | null) ?? []) {
          const html = readStoredContractHtml(row);
          if (!html) continue;
          const id = String(row.id);
          const num = sanitizeFilePart(String(row.contract_number || id).slice(0, 40));
          const rel = `06_contratos/html/${num}_${id.slice(0, 8)}.html`;
          const path = exportStagingFilePath(companyId, exportId, rel);
          const up = await uploadText(admin, path, html, 'text/html; charset=utf-8');
          if (up.ok) {
            if (!cursor.files.includes(rel)) {
              cursor.files.push(rel);
              filesExported += 1;
            }
            totalSize += up.size;
          }
        }
      }
      cursor.contractHtmlOffset += batch.length;
    }

    await admin
      .from('company_export_jobs')
      .update({
        progress: 88,
        current_step: 'contract_html',
        step_cursor: cursor,
        records_exported: recordsExported,
        files_exported: filesExported,
        total_size: totalSize,
      })
      .eq('id', exportId)
      .eq('company_id', companyId);

    return { done: false, failed: false };
  }

  if (cursor.phase === 'geojson_blocks') {
    const { data, error } = await admin
      .from('blocks')
      .select(
        'id, project_id, block_name, number, lot_number, area, segments_json, geometry, geojson, coordinates',
      )
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .range(cursor.geojsonOffset, cursor.geojsonOffset + COMPANY_EXPORT_PAGE_SIZE - 1);

    if (error) {
      cursor.warnings.push(`geojson_blocks: ${error.message}`);
      cursor.phase = 'readme';
    } else {
      const rows = (data as unknown as Record<string, unknown>[] | null) ?? [];
      if (rows.length === 0 && cursor.geojsonOffset === 0) {
        cursor.phase = 'readme';
      } else if (rows.length === 0) {
        cursor.phase = 'readme';
      } else {
        const rel = `04_empreendimentos/blocks_p${Math.floor(cursor.geojsonOffset / COMPANY_EXPORT_PAGE_SIZE) + 1}.geojson`;
        const path = exportStagingFilePath(companyId, exportId, rel);
        const geo = blocksToGeoJson(rows);
        const up = await uploadText(admin, path, geo, 'application/geo+json');
        if (up.ok) {
          if (!cursor.files.includes(rel)) {
            cursor.files.push(rel);
            filesExported += 1;
          }
          totalSize += up.size;
        }
        if (rows.length < COMPANY_EXPORT_PAGE_SIZE) cursor.phase = 'readme';
        else cursor.geojsonOffset += COMPANY_EXPORT_PAGE_SIZE;
      }
    }

    await admin
      .from('company_export_jobs')
      .update({
        progress: 90,
        current_step: 'geojson_blocks',
        step_cursor: cursor,
        files_exported: filesExported,
        total_size: totalSize,
      })
      .eq('id', exportId)
      .eq('company_id', companyId);

    return { done: false, failed: false };
  }

  if (cursor.phase === 'readme') {
    const { data: company } = await admin
      .from('companies')
      .select('id, name, fantasy_name, razao_social, cnpj, document')
      .eq('id', companyId)
      .maybeSingle();

    const companyName =
      String(company?.fantasy_name || company?.name || company?.razao_social || companyId).trim() ||
      companyId;
    const companyDocument = String(company?.cnpj || company?.document || '').trim() || null;
    cursor.companyName = companyName;
    cursor.companyDocument = companyDocument;

    const html = buildExportReadmeHtml({
      companyName,
      companyDocument,
      exportId,
      reason: job.reason,
      notes: job.notes,
      createdAt: job.created_at,
      files: cursor.files,
      recordCounts: cursor.recordCounts,
    });
    const rel = 'LEIA-ME.html';
    const path = exportStagingFilePath(companyId, exportId, rel);
    const up = await uploadText(admin, path, html, 'text/html; charset=utf-8');
    if (up.ok) {
      if (!cursor.files.includes(rel)) {
        cursor.files.push(rel);
        filesExported += 1;
      }
      totalSize += up.size;
    }
    cursor.phase = 'manifest';

    await admin
      .from('company_export_jobs')
      .update({
        progress: 93,
        current_step: 'readme',
        step_cursor: cursor,
        files_exported: filesExported,
        total_size: totalSize,
      })
      .eq('id', exportId)
      .eq('company_id', companyId);

    return { done: false, failed: false };
  }

  if (cursor.phase === 'manifest') {
    const manifest: CompanyExportManifest = {
      export_id: exportId,
      company_id: companyId,
      company_name: cursor.companyName || companyId,
      company_document: cursor.companyDocument || null,
      requested_by: job.requested_by,
      reason: job.reason,
      notes: job.notes,
      created_at: job.created_at,
      completed_at: null,
      schema_version: COMPANY_EXPORT_SCHEMA_VERSION,
      phase: 'F1_TABULAR',
      tables_exported: Object.keys(cursor.recordCounts),
      records_per_table: cursor.recordCounts,
      files_generated: cursor.files,
      total_size_bytes: totalSize,
      errors: cursor.errors,
      warnings: cursor.warnings,
      missing_files: [],
      excluded_for_security: [
        'bank_credentials',
        'encrypted_payload',
        'api_key*',
        'signature_token',
        'OTP',
        'master_topography_*',
        'master_corporate_*',
        'ASAAS_API_KEY (env)',
        'storage binaries (F2)',
      ],
      checksum_sha256: null,
    };
    const rel = 'manifest.json';
    const path = exportStagingFilePath(companyId, exportId, rel);
    const body = JSON.stringify(manifest, null, 2);
    const up = await uploadText(admin, path, body, 'application/json');
    if (up.ok) {
      if (!cursor.files.includes(rel)) {
        cursor.files.push(rel);
        filesExported += 1;
      }
      totalSize += up.size;
    }
    cursor.phase = 'zip';

    await admin
      .from('company_export_jobs')
      .update({
        progress: 95,
        current_step: 'manifest',
        step_cursor: cursor,
        files_exported: filesExported,
        total_size: totalSize,
        manifest,
      })
      .eq('id', exportId)
      .eq('company_id', companyId);

    return { done: false, failed: false };
  }

  if (cursor.phase === 'zip') {
    const entries: { path: string; data: Buffer }[] = [];
    const checksumLines: string[] = [];

    for (const rel of cursor.files) {
      const path = exportStagingFilePath(companyId, exportId, rel);
      const { data, error } = await admin.storage.from(COMPANY_EXPORT_BUCKET).download(path);
      if (error || !data) {
        cursor.warnings.push(`ZIP missing staging file: ${rel}`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      entries.push({ path: rel, data: buf });
      const hash = createHash('sha256').update(buf).digest('hex');
      checksumLines.push(`${hash}  ${rel}`);
    }

    if (checksumLines.length) {
      const checksumBody = checksumLines.join('\n') + '\n';
      entries.push({ path: 'checksums.sha256', data: Buffer.from(checksumBody, 'utf8') });
      if (!cursor.files.includes('checksums.sha256')) cursor.files.push('checksums.sha256');
    }

    if (entries.length === 0) {
      await admin
        .from('company_export_jobs')
        .update({
          status: 'FAILED',
          progress: 100,
          current_step: 'zip',
          error_message: 'Nenhum arquivo gerado para o pacote.',
          step_cursor: cursor,
          completed_at: new Date().toISOString(),
        })
        .eq('id', exportId)
        .eq('company_id', companyId);
      await logCompanyExportAudit(admin, {
        companyId,
        userId: job.requested_by,
        action: COMPANY_EXPORT_AUDIT.FAILED,
        description: 'Exportação falhou: pacote vazio',
        details: { exportId },
      });
      return { done: true, failed: true };
    }

    const zipBuf = buildStoredZip(entries);
    const packagePath = exportPackagePath(companyId, exportId);
    const { error: zipErr } = await admin.storage
      .from(COMPANY_EXPORT_BUCKET)
      .upload(packagePath, zipBuf, {
        contentType: 'application/zip',
        upsert: true,
      });

    if (zipErr) {
      await admin
        .from('company_export_jobs')
        .update({
          status: 'FAILED',
          error_message: `Falha ao gravar package.zip: ${zipErr.message}`,
          current_step: 'zip',
          step_cursor: cursor,
          completed_at: new Date().toISOString(),
        })
        .eq('id', exportId)
        .eq('company_id', companyId);
      return { done: true, failed: true };
    }

    const packageHash = createHash('sha256').update(zipBuf).digest('hex');
    const completedAt = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);

    const manifest: CompanyExportManifest = {
      ...(job.manifest as CompanyExportManifest),
      export_id: exportId,
      company_id: companyId,
      company_name: cursor.companyName || companyId,
      company_document: cursor.companyDocument || null,
      requested_by: job.requested_by,
      reason: job.reason,
      notes: job.notes,
      created_at: job.created_at,
      completed_at: completedAt,
      schema_version: COMPANY_EXPORT_SCHEMA_VERSION,
      phase: 'F1_TABULAR',
      tables_exported: Object.keys(cursor.recordCounts),
      records_per_table: cursor.recordCounts,
      files_generated: cursor.files,
      total_size_bytes: zipBuf.length,
      errors: cursor.errors,
      warnings: cursor.warnings,
      missing_files: cursor.warnings.filter((w) => w.includes('missing')),
      excluded_for_security: [
        'bank_credentials',
        'encrypted_payload',
        'api_key*',
        'signature_token',
        'OTP',
        'master_* platform tables',
        'storage binaries (F2)',
      ],
      checksum_sha256: packageHash,
    };

    cursor.phase = 'done';
    totalSize = zipBuf.length;
    filesExported = cursor.files.length;

    await admin
      .from('company_export_jobs')
      .update({
        status: 'COMPLETED',
        progress: 100,
        current_step: 'done',
        step_cursor: cursor,
        records_exported: recordsExported,
        files_exported: filesExported,
        total_size: totalSize,
        storage_bucket: COMPANY_EXPORT_BUCKET,
        storage_path: packagePath,
        signed_url_expires_at: expiresAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        completed_at: completedAt,
        manifest,
        error_message: null,
      })
      .eq('id', exportId)
      .eq('company_id', companyId);

    await logCompanyExportAudit(admin, {
      companyId,
      userId: job.requested_by,
      action: COMPANY_EXPORT_AUDIT.COMPLETED,
      description: `Exportação concluída (${reasonLabel(job.reason)})`,
      details: {
        exportId,
        records: recordsExported,
        files: filesExported,
        size: totalSize,
      },
    });

    return { done: true, failed: false };
  }

  return { done: true, failed: false };
}
