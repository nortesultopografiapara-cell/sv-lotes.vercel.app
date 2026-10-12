/**
 * Persistência atômica do job Inter em bank_integrations.metadata.
 * Prefere RPC cas_inter_resume_jobs (FOR UPDATE + WHERE _rev).
 * Fallback: UPDATE PostgREST com filtro na revisão.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INTER_RESUME_CAS_RPC,
  INTER_RESUME_JOBS_METADATA_KEY,
  INTER_RESUME_JOBS_REV_KEY,
  casWriteInterResumeJob,
  hydrateJobFromBundle,
  parseInterResumeJobsBundle,
  serializeInterResumeJobsBundle,
  type InterResumeJobsBundle,
} from '@/lib/banking/inter/interSaleChargesResume';
import type { InterResumeJobStore } from '@/lib/banking/inter/interSaleChargesResumeWorker';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function loadBundle(
  admin: SupabaseClient,
  integrationId: string,
  companyId: string,
): Promise<{ bundle: InterResumeJobsBundle; meta: Record<string, unknown> }> {
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, metadata')
    .eq('id', integrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const meta = asRecord(data?.metadata);
  return {
    bundle: parseInterResumeJobsBundle(meta[INTER_RESUME_JOBS_METADATA_KEY]),
    meta,
  };
}

async function persistBundleAtomic(params: {
  admin: SupabaseClient;
  integrationId: string;
  companyId: string;
  expectedRev: number;
  bundle: InterResumeJobsBundle;
  meta: Record<string, unknown>;
}): Promise<{ ok: boolean; bundle: InterResumeJobsBundle }> {
  const jobsJson = serializeInterResumeJobsBundle(params.bundle);
  const nextMeta = {
    ...params.meta,
    [INTER_RESUME_JOBS_METADATA_KEY]: jobsJson,
  };

  const rpc = await params.admin.rpc(INTER_RESUME_CAS_RPC, {
    p_integration_id: params.integrationId,
    p_company_id: params.companyId,
    p_expected_rev: params.expectedRev,
    p_jobs: jobsJson,
  });
  if (!rpc.error) {
    if (!rpc.data) return { ok: false, bundle: params.bundle };
    const savedMeta = asRecord(rpc.data);
    return {
      ok: true,
      bundle: parseInterResumeJobsBundle(savedMeta[INTER_RESUME_JOBS_METADATA_KEY]),
    };
  }

  const missingFn = /could not find|does not exist|PGRST202/i.test(String(rpc.error.message || ''));
  if (!missingFn) throw new Error(rpc.error.message);

  let query = params.admin
    .from('bank_integrations')
    .update({
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.integrationId)
    .eq('company_id', params.companyId);

  if (params.expectedRev <= 0) {
    query = query.or(
      `metadata->${INTER_RESUME_JOBS_METADATA_KEY}->>${INTER_RESUME_JOBS_REV_KEY}.eq.0,metadata->${INTER_RESUME_JOBS_METADATA_KEY}->>${INTER_RESUME_JOBS_REV_KEY}.is.null`,
    );
  } else {
    query = query.filter(
      `metadata->${INTER_RESUME_JOBS_METADATA_KEY}->>${INTER_RESUME_JOBS_REV_KEY}`,
      'eq',
      String(params.expectedRev),
    );
  }

  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return { ok: false, bundle: params.bundle };
  return { ok: true, bundle: params.bundle };
}

export function createSupabaseInterResumeStore(
  admin: SupabaseClient,
  integrationId: string,
): InterResumeJobStore {
  return {
    async load(companyId, saleId) {
      const { bundle } = await loadBundle(admin, integrationId, companyId);
      return hydrateJobFromBundle(bundle, saleId);
    },
    async save(job, expectedRevision) {
      const loaded = await loadBundle(admin, job.integrationId || integrationId, job.companyId);
      const applied = casWriteInterResumeJob({
        bundle: loaded.bundle,
        expectedRev: expectedRevision,
        job,
      });
      if (!applied.ok) {
        return {
          ok: false,
          current: hydrateJobFromBundle(applied.bundle, job.saleId),
          mapRev: loaded.bundle._rev,
        };
      }
      const persisted = await persistBundleAtomic({
        admin,
        integrationId: job.integrationId || integrationId,
        companyId: job.companyId,
        expectedRev: expectedRevision,
        bundle: applied.bundle,
        meta: loaded.meta,
      });
      if (!persisted.ok) {
        const fresh = await loadBundle(admin, job.integrationId || integrationId, job.companyId);
        return {
          ok: false,
          current: hydrateJobFromBundle(fresh.bundle, job.saleId),
          mapRev: fresh.bundle._rev,
        };
      }
      return {
        ok: true,
        current: hydrateJobFromBundle(persisted.bundle, job.saleId),
        mapRev: persisted.bundle._rev,
      };
    },
  };
}
