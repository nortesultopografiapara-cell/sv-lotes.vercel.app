import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMPANY_EXPORT_AUDIT,
  logCompanyExportAudit,
} from '@/lib/master/companyExport/audit';
import { processCompanyExportStep } from '@/lib/master/companyExport/processStep';
import {
  COMPANY_EXPORT_BUCKET,
  defaultExpiresAt,
  exportPackagePath,
} from '@/lib/master/companyExport/storagePaths';
import { assertRegistrySecurity } from '@/lib/master/companyExport/registry';
import {
  COMPANY_EXPORT_SIGNED_URL_SECONDS,
  DEFAULT_COMPANY_EXPORT_OPTIONS,
  emptyStepCursor,
  isCompanyExportReason,
  normalizeExportOptions,
  normalizeExportVersion,
  type CompanyExportJobRow,
  type CompanyExportOptions,
  type CompanyExportReason,
  type CompanyExportVersion,
} from '@/lib/master/companyExport/types';
import { assertStorageRegistrySecurity } from '@/lib/master/companyExport/storageRegistry';

assertRegistrySecurity();
assertStorageRegistrySecurity();

export class CompanyExportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CompanyExportError';
    this.status = status;
  }
}

export async function createCompanyExportJob(
  admin: SupabaseClient,
  input: {
    companyId: string;
    requestedBy: string;
    reason: string;
    notes?: string | null;
    exportVersion?: string | null;
    options?: Partial<CompanyExportOptions> | null;
  },
): Promise<CompanyExportJobRow> {
  if (!isCompanyExportReason(input.reason)) {
    throw new CompanyExportError('Motivo de exportação inválido.');
  }

  const exportVersion: CompanyExportVersion = normalizeExportVersion(
    input.exportVersion ?? 'F2_COMPLETE',
  );
  const options = normalizeExportOptions({
    ...DEFAULT_COMPANY_EXPORT_OPTIONS,
    ...(input.options || {}),
  });

  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', input.companyId)
    .maybeSingle();

  if (companyError || !company) {
    throw new CompanyExportError('Empresa não encontrada.', 404);
  }

  const expiresAt = defaultExpiresAt();
  const { data, error } = await admin
    .from('company_export_jobs')
    .insert({
      company_id: input.companyId,
      requested_by: input.requestedBy,
      reason: input.reason as CompanyExportReason,
      notes: input.notes?.trim() || null,
      status: 'PENDING',
      progress: 0,
      current_step: 'queued',
      step_cursor: emptyStepCursor(exportVersion, options),
      storage_bucket: COMPANY_EXPORT_BUCKET,
      expires_at: expiresAt.toISOString(),
      export_version: exportVersion,
      options,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new CompanyExportError(error?.message || 'Falha ao criar job de exportação.', 500);
  }

  await logCompanyExportAudit(admin, {
    companyId: input.companyId,
    userId: input.requestedBy,
    action: COMPANY_EXPORT_AUDIT.CREATED,
    description: `Job de exportação criado (${input.reason} / ${exportVersion})`,
    details: { exportId: data.id, companyName: company.name, exportVersion, options },
  });

  return data as CompanyExportJobRow;
}

export async function listCompanyExportJobs(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyExportJobRow[]> {
  const { data, error } = await admin
    .from('company_export_jobs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new CompanyExportError(error.message, 500);
  return (data as CompanyExportJobRow[] | null) ?? [];
}

export async function getCompanyExportJob(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
): Promise<CompanyExportJobRow> {
  const { data, error } = await admin
    .from('company_export_jobs')
    .select('*')
    .eq('id', exportId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new CompanyExportError(error.message, 500);
  if (!data) throw new CompanyExportError('Exportação não encontrada.', 404);
  return data as CompanyExportJobRow;
}

export async function cancelCompanyExportJob(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  userId: string,
): Promise<CompanyExportJobRow> {
  const job = await getCompanyExportJob(admin, companyId, exportId);
  if (job.status !== 'PENDING' && job.status !== 'PROCESSING') {
    throw new CompanyExportError('Somente jobs PENDING ou PROCESSING podem ser cancelados.');
  }

  const { data, error } = await admin
    .from('company_export_jobs')
    .update({
      status: 'CANCELLED',
      current_step: 'cancelled',
      completed_at: new Date().toISOString(),
      error_message: 'Cancelado pelo administrador.',
    })
    .eq('id', exportId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error || !data) throw new CompanyExportError(error?.message || 'Falha ao cancelar.', 500);

  await logCompanyExportAudit(admin, {
    companyId,
    userId,
    action: COMPANY_EXPORT_AUDIT.CANCELLED,
    description: 'Exportação cancelada',
    details: { exportId },
  });

  return data as CompanyExportJobRow;
}

export async function createExportDownloadUrl(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  userId: string,
): Promise<{ url: string; expiresIn: number; expiresAt: string }> {
  const job = await getCompanyExportJob(admin, companyId, exportId);
  if (job.status !== 'COMPLETED') {
    throw new CompanyExportError('Pacote ainda não está disponível para download.', 409);
  }
  if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) {
    throw new CompanyExportError('Pacote expirado.', 410);
  }

  const path = job.storage_path || exportPackagePath(companyId, exportId);
  const bucket = job.storage_bucket || COMPANY_EXPORT_BUCKET;
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, COMPANY_EXPORT_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new CompanyExportError(error?.message || 'Falha ao gerar URL assinada.', 500);
  }

  const expiresAt = new Date(
    Date.now() + COMPANY_EXPORT_SIGNED_URL_SECONDS * 1000,
  ).toISOString();

  await logCompanyExportAudit(admin, {
    companyId,
    userId,
    action: COMPANY_EXPORT_AUDIT.DOWNLOAD,
    description: 'Download da exportação solicitado',
    details: { exportId },
  });

  return {
    url: data.signedUrl,
    expiresIn: COMPANY_EXPORT_SIGNED_URL_SECONDS,
    expiresAt,
  };
}

export async function deleteExportPackageFile(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  userId: string,
): Promise<{ removedPaths: string[]; removedCount: number; approxBytes: number }> {
  const job = await getCompanyExportJob(admin, companyId, exportId);
  const bucket = job.storage_bucket || COMPANY_EXPORT_BUCKET;
  const removedPaths: string[] = [];
  let approxBytes = 0;
  const visited = new Set<string>();

  const removeBatch = async (paths: string[]) => {
    if (!paths.length) return;
    const unique = [...new Set(paths)].filter((p) => p && !removedPaths.includes(p));
    if (!unique.length) return;
    const { error } = await admin.storage.from(bucket).remove(unique);
    if (!error) {
      for (const p of unique) removedPaths.push(p);
    }
  };

  // package.zip first
  const packagePath = job.storage_path || exportPackagePath(companyId, exportId);
  await removeBatch([packagePath]);
  if (Number(job.total_size || 0) > 0) approxBytes += Number(job.total_size || 0);

  const rootPrefix = `${companyId}/${exportId}`;
  const queue = [rootPrefix];
  let guard = 0;
  while (queue.length && guard < 200) {
    guard += 1;
    const prefix = queue.shift()!;
    if (visited.has(prefix)) continue;
    visited.add(prefix);

    const { data: listed, error: listErr } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (listErr || !listed?.length) continue;

    const filePaths: string[] = [];
    for (const item of listed) {
      if (!item?.name || item.name === '.emptyFolderPlaceholder') continue;
      const child = `${prefix}/${item.name}`;
      const size =
        item.metadata && typeof (item.metadata as { size?: unknown }).size === 'number'
          ? Number((item.metadata as { size: number }).size)
          : null;
      const looksLikeFile =
        size != null ||
        Boolean(item.id) ||
        /\.[a-z0-9]{1,8}$/i.test(item.name) ||
        item.name === 'package.zip';

      if (looksLikeFile) {
        filePaths.push(child);
        if (size && size > 0) approxBytes += size;
      } else {
        queue.push(child);
      }
    }
    // remove in chunks of 50
    for (let i = 0; i < filePaths.length; i += 50) {
      await removeBatch(filePaths.slice(i, i + 50));
    }
  }

  await admin
    .from('company_export_jobs')
    .update({
      storage_path: null,
      signed_url_expires_at: null,
      error_message:
        job.status === 'COMPLETED' || job.status === 'EXPIRED'
          ? 'Arquivo de homologação removido manualmente.'
          : job.error_message || 'Arquivo de homologação removido manualmente.',
    })
    .eq('id', exportId)
    .eq('company_id', companyId);

  await logCompanyExportAudit(admin, {
    companyId,
    userId,
    action: COMPANY_EXPORT_AUDIT.FILE_DELETED,
    description: 'Arquivo de exportação removido',
    details: {
      exportId,
      removedCount: removedPaths.length,
      approxBytes,
      note: 'Histórico do job preservado; buckets tenant intactos',
    },
  });

  return {
    removedPaths,
    removedCount: removedPaths.length,
    approxBytes,
  };
}

/** Avança um job específico por até maxSteps etapas (útil em Preview sem cron). */
export async function advanceCompanyExportJob(
  admin: SupabaseClient,
  companyId: string,
  exportId: string,
  maxSteps = 12,
): Promise<{ steps: number; done: boolean; failed: boolean; status: string }> {
  let steps = 0;
  for (let i = 0; i < maxSteps; i++) {
    const { data: raw, error } = await admin
      .from('company_export_jobs')
      .select('*')
      .eq('id', exportId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!raw) throw new CompanyExportError('Exportação não encontrada.', 404);
    const job = raw as CompanyExportJobRow;
    if (job.status === 'CANCELLED' || job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'EXPIRED') {
      return { steps, done: true, failed: job.status === 'FAILED', status: job.status };
    }
    if (job.status === 'PENDING') {
      await admin
        .from('company_export_jobs')
        .update({
          status: 'PROCESSING',
          started_at: job.started_at || new Date().toISOString(),
          current_step: 'starting',
        })
        .eq('id', exportId)
        .eq('company_id', companyId)
        .eq('status', 'PENDING');
    }
    const { data: fresh } = await admin
      .from('company_export_jobs')
      .select('*')
      .eq('id', exportId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!fresh || fresh.status === 'CANCELLED') {
      return { steps, done: true, failed: false, status: fresh?.status || 'CANCELLED' };
    }
    const result = await processCompanyExportStep(admin, fresh as CompanyExportJobRow);
    steps += 1;
    if (result.done) {
      return {
        steps,
        done: true,
        failed: Boolean(result.failed),
        status: result.failed ? 'FAILED' : 'COMPLETED',
      };
    }
  }
  const latest = await getCompanyExportJob(admin, companyId, exportId);
  return { steps, done: false, failed: false, status: latest.status };
}

/** Processa até N jobs PENDING/PROCESSING (uma etapa cada). */
export async function runCompanyExportWorker(
  admin: SupabaseClient,
  limit = 2,
): Promise<{ processed: number; completed: number; failed: number }> {
  const { data: jobs, error } = await admin
    .from('company_export_jobs')
    .select('*')
    .in('status', ['PENDING', 'PROCESSING'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const raw of (jobs as CompanyExportJobRow[] | null) ?? []) {
    if (raw.status === 'PENDING') {
      await admin
        .from('company_export_jobs')
        .update({
          status: 'PROCESSING',
          started_at: raw.started_at || new Date().toISOString(),
          current_step: 'starting',
        })
        .eq('id', raw.id)
        .eq('company_id', raw.company_id)
        .eq('status', 'PENDING');
    }

    const { data: fresh } = await admin
      .from('company_export_jobs')
      .select('*')
      .eq('id', raw.id)
      .eq('company_id', raw.company_id)
      .maybeSingle();

    if (!fresh || fresh.status === 'CANCELLED') continue;

    try {
      const result = await processCompanyExportStep(admin, fresh as CompanyExportJobRow);
      processed += 1;
      if (result.done && result.failed) failed += 1;
      else if (result.done) completed += 1;
    } catch (err) {
      failed += 1;
      processed += 1;
      const message = err instanceof Error ? err.message : 'Erro no worker';
      await admin
        .from('company_export_jobs')
        .update({
          status: 'FAILED',
          error_message: message,
          completed_at: new Date().toISOString(),
          current_step: 'failed',
        })
        .eq('id', raw.id)
        .eq('company_id', raw.company_id);
      await logCompanyExportAudit(admin, {
        companyId: raw.company_id,
        userId: raw.requested_by,
        action: COMPANY_EXPORT_AUDIT.FAILED,
        description: 'Exportação falhou',
        details: { exportId: raw.id, error: message },
      });
    }
  }

  return { processed, completed, failed };
}

export async function expireCompanyExportPackages(
  admin: SupabaseClient,
): Promise<{ expired: number }> {
  const nowIso = new Date().toISOString();
  const { data: jobs, error } = await admin
    .from('company_export_jobs')
    .select('*')
    .eq('status', 'COMPLETED')
    .lt('expires_at', nowIso)
    .limit(50);

  if (error) throw new Error(error.message);

  let expired = 0;
  for (const job of (jobs as CompanyExportJobRow[] | null) ?? []) {
    const path = job.storage_path || exportPackagePath(job.company_id, job.id);
    const bucket = job.storage_bucket || COMPANY_EXPORT_BUCKET;
    await admin.storage.from(bucket).remove([path]).catch(() => undefined);

    await admin
      .from('company_export_jobs')
      .update({
        status: 'EXPIRED',
        storage_path: null,
        current_step: 'expired',
      })
      .eq('id', job.id)
      .eq('company_id', job.company_id);

    await logCompanyExportAudit(admin, {
      companyId: job.company_id,
      userId: job.requested_by,
      action: COMPANY_EXPORT_AUDIT.EXPIRED,
      description: 'Pacote de exportação expirado e removido',
      details: { exportId: job.id },
    });
    expired += 1;
  }

  return { expired };
}
