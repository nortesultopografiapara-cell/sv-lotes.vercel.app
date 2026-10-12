/**
 * Persistência do job Inter em bank_integrations.metadata (sem migration).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INTER_RESUME_JOBS_METADATA_KEY,
  type InterSaleChargesResumeJob,
} from '@/lib/banking/inter/interSaleChargesResume';
import type { InterResumeJobStore } from '@/lib/banking/inter/interSaleChargesResumeWorker';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function createSupabaseInterResumeStore(
  admin: SupabaseClient,
  integrationId: string,
): InterResumeJobStore {
  return {
    async load(companyId, saleId) {
      const { data, error } = await admin
        .from('bank_integrations')
        .select('id, company_id, metadata')
        .eq('id', integrationId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const meta = asRecord(data?.metadata);
      const jobs = asRecord(meta[INTER_RESUME_JOBS_METADATA_KEY]);
      const job = jobs[saleId];
      if (!job || typeof job !== 'object' || Array.isArray(job)) return null;
      return job as InterSaleChargesResumeJob;
    },
    async save(job, expectedRevision) {
      const { data, error } = await admin
        .from('bank_integrations')
        .select('id, company_id, metadata')
        .eq('id', job.integrationId)
        .eq('company_id', job.companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.id) return { ok: false, current: null };
      const meta = asRecord(data.metadata);
      const jobs = asRecord(meta[INTER_RESUME_JOBS_METADATA_KEY]);
      const currentRaw = jobs[job.saleId];
      const current =
        currentRaw && typeof currentRaw === 'object' && !Array.isArray(currentRaw)
          ? (currentRaw as InterSaleChargesResumeJob)
          : null;
      const currentRev = current?.revision ?? 0;
      if (expectedRevision !== currentRev && !(expectedRevision === 0 && !current)) {
        return { ok: false, current };
      }
      const nextJobs = { ...jobs, [job.saleId]: job };
      const { error: updErr } = await admin
        .from('bank_integrations')
        .update({
          metadata: { ...meta, [INTER_RESUME_JOBS_METADATA_KEY]: nextJobs },
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.integrationId)
        .eq('company_id', job.companyId);
      if (updErr) throw new Error(updErr.message);
      return { ok: true, current: job };
    },
  };
}
