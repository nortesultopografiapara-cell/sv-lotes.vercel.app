/**
 * Listagem de contratos — select enxuto com fallback de schema e tenant/company.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMissingContractColumn } from '@/lib/contractRegeneration';
import { resolveCanonicalSaleSignatureStatus } from '@/lib/saleContractDashboardStats';
import { isTerminationSaleSignature } from '@/lib/saleContractSignatureDocumentType';

/** Colunas confirmadas em migrations — sem generated_html. */
export const CONTRACT_LIST_SELECT_CORE = [
  'id',
  'contract_number',
  'status',
  'signature_status',
  'created_at',
  'customer_id',
  'block_id',
  'project_id',
  'sale_id',
  'tenant_id',
  'project_name_snapshot',
  'version',
  'regenerated_from',
  'broker_id',
  'needs_regenerar',
].join(', ');

/** Colunas opcionais (podem não existir em ambientes legados). */
export const CONTRACT_LIST_OPTIONAL_COLUMNS = [
  'company_id',
  'sale_value',
  'down_payment',
  'installments',
  'customer_name',
  'location_display',
  'plan_type',
  'contract_model',
] as const;

export type ContractsListLoadResult = {
  rows: Record<string, unknown>[];
  selectUsed: string;
  error: string | null;
};

function logContractsList(
  step: string,
  extra?: Record<string, unknown>,
) {
  console.log('[contracts/list]', step, extra ?? {});
}

function buildSelectFromColumns(columns: string[]): string {
  return columns.join(', ');
}

function stripSelectColumn(select: string, column: string): string {
  return select
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== column)
    .join(', ');
}

async function runContractsSelectQuery(
  supabase: SupabaseClient,
  select: string,
  tenantId: string,
  label: string,
): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }> {
  const res = await supabase
    .from('contracts')
    .select(select)
    .or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`)
    .order('created_at', { ascending: false });

  logContractsList('query', {
    label,
    count: res.data?.length ?? 0,
    error: res.error?.message ?? null,
    code: res.error?.code ?? null,
  });

  return {
    data: (res.data as Record<string, unknown>[] | null) ?? null,
    error: res.error,
  };
}

async function runContractsSelectWithFallback(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ rows: Record<string, unknown>[]; selectUsed: string; error: string | null }> {
  let select = buildSelectFromColumns([
    ...CONTRACT_LIST_SELECT_CORE.split(', '),
    ...CONTRACT_LIST_OPTIONAL_COLUMNS,
  ]);

  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await runContractsSelectQuery(
      supabase,
      select,
      tenantId,
      `tenant_or_company_attempt_${attempt + 1}`,
    );

    if (!error) {
      return { rows: data ?? [], selectUsed: select, error: null };
    }

    const missing = parseMissingContractColumn(error.message);
    if (missing && select.includes(missing)) {
      select = stripSelectColumn(select, missing);
      logContractsList('select_fallback', { removed: missing, attempt: attempt + 1 });
      continue;
    }

    if (error.message?.includes('company_id')) {
      logContractsList('company_id_filter_fallback', { tenantId });
      const byTenant = await supabase
        .from('contracts')
        .select(select)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      logContractsList('query', {
        label: 'tenant_id_only',
        count: byTenant.data?.length ?? 0,
        error: byTenant.error?.message ?? null,
      });

      if (!byTenant.error) {
        return { rows: (byTenant.data as Record<string, unknown>[]) ?? [], selectUsed: select, error: null };
      }

      const missingTenant = parseMissingContractColumn(byTenant.error.message);
      if (missingTenant && select.includes(missingTenant)) {
        select = stripSelectColumn(select, missingTenant);
        continue;
      }

      return { rows: [], selectUsed: select, error: byTenant.error.message || 'Falha ao listar contratos.' };
    }

    return { rows: [], selectUsed: select, error: error.message || 'Falha ao listar contratos.' };
  }

  return { rows: [], selectUsed: select, error: 'Não foi possível montar consulta de contratos.' };
}

export async function loadContractsListForTenant(
  supabase: SupabaseClient,
  options: {
    tenantId: string | null;
    isPlatformAdmin: boolean;
  },
): Promise<ContractsListLoadResult> {
  const { tenantId, isPlatformAdmin } = options;
  logContractsList('start', { activeTenantId: tenantId, isPlatformAdmin });

  if (!tenantId) {
    if (isPlatformAdmin) {
      const select = CONTRACT_LIST_SELECT_CORE;
      const res = await supabase
        .from('contracts')
        .select(select)
        .order('created_at', { ascending: false });
      logContractsList('query', {
        label: 'admin_sem_filtro',
        count: res.data?.length ?? 0,
        error: res.error?.message ?? null,
      });
      if (res.error) {
        return { rows: [], selectUsed: select, error: res.error.message };
      }
      const adminRows = (res.data as Record<string, unknown>[]) ?? [];
      const enrichedAdmin = await enrichContractsListWithProcessSignatureStatus(
        supabase,
        adminRows,
      );
      return {
        rows: enrichedAdmin,
        selectUsed: select,
        error: null,
      };
    }
    return { rows: [], selectUsed: CONTRACT_LIST_SELECT_CORE, error: null };
  }

  const primary = await runContractsSelectWithFallback(supabase, tenantId);
  if (primary.error && primary.rows.length === 0) {
    logContractsList('response', { count: 0, error: primary.error });
    return primary;
  }

  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const row of primary.rows) {
    const id = String(row.id || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(row);
  }

  if (primary.selectUsed.includes('company_id')) {
    const { data: byCompanyOnly, error: companyErr } = await supabase
      .from('contracts')
      .select(primary.selectUsed)
      .eq('company_id', tenantId)
      .is('tenant_id', null)
      .order('created_at', { ascending: false });

    if (!companyErr && byCompanyOnly?.length) {
      for (const row of byCompanyOnly as Record<string, unknown>[]) {
        const id = String(row.id || '');
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        merged.push(row);
      }
      logContractsList('company_only_rows', { added: byCompanyOnly.length });
    }
  }

  merged.sort((a, b) => {
    const ta = new Date(String(a.created_at || 0)).getTime();
    const tb = new Date(String(b.created_at || 0)).getTime();
    return tb - ta;
  });

  const enriched = await enrichContractsListWithProcessSignatureStatus(
    supabase,
    merged,
  );

  logContractsList('response', {
    activeTenantId: tenantId,
    count: enriched.length,
    selectUsed: primary.selectUsed,
  });

  return {
    rows: enriched,
    selectUsed: primary.selectUsed,
    error: primary.error,
  };
}

/**
 * Alinha `signature_status` da listagem ao processo eletrônico mais recente
 * (`contract_signatures`), quando o espelho em `contracts` ficou defasado.
 * Não altera status comercial/financeiro — só a fonte canônica de assinatura.
 */
export async function enrichContractsListWithProcessSignatureStatus(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const ids = rows
    .map((r) => String(r.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return rows;

  const { data, error } = await supabase
    .from('contract_signatures')
    .select('contract_id, signature_status, created_at, signed_document_type')
    .in('contract_id', ids)
    .order('created_at', { ascending: false });

  if (error) {
    logContractsList('process_signature_enrich_skip', {
      error: error.message,
    });
    return rows;
  }

  const latestByContract = new Map<string, string>();
  for (const row of data || []) {
    if (isTerminationSaleSignature(row as { signed_document_type?: string | null })) {
      continue;
    }
    const cid = String(
      (row as { contract_id?: string }).contract_id || '',
    ).trim();
    if (!cid || latestByContract.has(cid)) continue;
    latestByContract.set(
      cid,
      String((row as { signature_status?: string }).signature_status || ''),
    );
  }

  if (!latestByContract.size) return rows;

  return rows.map((row) => {
    const id = String(row.id || '').trim();
    const processStatus = latestByContract.get(id);
    if (!processStatus) return row;
    const canonical = resolveCanonicalSaleSignatureStatus({
      signature_status: row.signature_status as string | null,
      process_signature_status: processStatus,
    });
    return {
      ...row,
      process_signature_status: processStatus,
      signature_status: canonical || row.signature_status,
    };
  });
}
