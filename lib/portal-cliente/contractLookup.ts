/**
 * Busca read-only de contrato de venda — Portal do Cliente.
 * Select resiliente a colunas opcionais + estratégias de vínculo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMissingContractColumn } from '@/lib/contractRegeneration';
import {
  logClientPortalDashboardDiagnostic,
  scopeIdFingerprint,
} from '@/lib/portal-cliente/dashboardDiagnosticLog';
import type { PortalValidatedSaleScope } from '@/lib/portal-cliente/scopeValidation';

export type PortalContractRow = Record<string, unknown> & {
  id: string;
  sale_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  block_id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  contract_number?: string | null;
  status?: string | null;
  created_at?: string | null;
  version?: number | null;
  superseded_by?: string | null;
  signature_status?: string | null;
  signature_token?: string | null;
  signature_expires_at?: string | null;
  pdf_signed_url?: string | null;
  pdf_url?: string | null;
};

export type PortalContractLookupResult = {
  row: PortalContractRow | null;
  strategy: string | null;
  filter: string | null;
  rowCount: number;
  reason: string | null;
  selectUsed: string | null;
  queryError: string | null;
};

const PORTAL_CONTRACT_COLUMNS = [
  'id',
  'sale_id',
  'customer_id',
  'project_id',
  'block_id',
  'tenant_id',
  'company_id',
  'contract_number',
  'status',
  'created_at',
  'version',
  'superseded_by',
  'signature_status',
  'signature_token',
  'signature_expires_at',
  'pdf_signed_url',
  'pdf_url',
  'generated_html',
  'html_content',
  'contract_html',
  'content',
  'html',
];

const ACTIVE_CONTRACT_STATUSES = new Set(['ativo', 'assinado', 'rascunho']);
const INACTIVE_CONTRACT_STATUSES = new Set(['cancelado', 'superseded', 'cancelled']);

function stripSelectColumn(select: string, column: string): string {
  return select
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== column)
    .join(', ');
}

async function runResilientContractsSelect(
  admin: SupabaseClient,
  apply: (query: ReturnType<SupabaseClient['from']>) => ReturnType<SupabaseClient['from']>,
): Promise<{ rows: PortalContractRow[]; selectUsed: string; error: string | null }> {
  let select = PORTAL_CONTRACT_COLUMNS.join(', ');

  for (let attempt = 0; attempt < PORTAL_CONTRACT_COLUMNS.length + 2; attempt++) {
    let query = admin.from('contracts').select(select);
    query = apply(query as ReturnType<SupabaseClient['from']>) as ReturnType<
      SupabaseClient['from']
    >;
    const { data, error } = await query;

    if (!error) {
      return {
        rows: (data as PortalContractRow[] | null) ?? [],
        selectUsed: select,
        error: null,
      };
    }

    const missing = parseMissingContractColumn(error.message);
    if (missing && select.includes(missing)) {
      select = stripSelectColumn(select, missing);
      continue;
    }

    return { rows: [], selectUsed: select, error: error.message || 'query_failed' };
  }

  return { rows: [], selectUsed: select, error: 'select_exhausted' };
}

function belongsToValidatedScope(row: PortalContractRow, validated: PortalValidatedSaleScope): boolean {
  if (String(row.customer_id || '') !== validated.customerId) return false;
  if (String(row.sale_id || '') !== validated.saleId) return false;

  const tenant = String(row.tenant_id || row.company_id || '').trim();
  if (tenant && tenant !== validated.companyId) return false;

  return true;
}

function pickBestPortalContract(rows: PortalContractRow[]): PortalContractRow | null {
  if (rows.length === 0) return null;

  const ranked = [...rows].sort((a, b) => {
    const aStatus = String(a.status || '').toLowerCase();
    const bStatus = String(b.status || '').toLowerCase();
    const aInactive = INACTIVE_CONTRACT_STATUSES.has(aStatus) || Boolean(a.superseded_by) ? 1 : 0;
    const bInactive = INACTIVE_CONTRACT_STATUSES.has(bStatus) || Boolean(b.superseded_by) ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;

    const aActive = ACTIVE_CONTRACT_STATUSES.has(aStatus) ? 1 : 0;
    const bActive = ACTIVE_CONTRACT_STATUSES.has(bStatus) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const versionDiff = Number(b.version || 0) - Number(a.version || 0);
    if (versionDiff !== 0) return versionDiff;

    return (
      new Date(String(b.created_at || 0)).getTime() -
      new Date(String(a.created_at || 0)).getTime()
    );
  });

  return ranked[0] ?? null;
}

function logContractLookup(input: {
  strategy: string;
  filter: string;
  sessionContractId: string | null;
  foundContractId: string | null;
  rowCount: number;
  reason: string | null;
  outcome: 'success' | 'empty' | 'failure';
  queryError?: string | null;
  selectUsed?: string | null;
}): void {
  logClientPortalDashboardDiagnostic({
    step: '8_query_contract',
    outcome: input.outcome,
    table: 'contracts',
    filter: input.filter,
    rowCount: input.rowCount,
    httpStatus: 200,
    contractId: scopeIdFingerprint(input.sessionContractId),
    contractIdFound: scopeIdFingerprint(input.foundContractId),
    reason: input.reason || undefined,
    errorMessage: input.queryError || undefined,
    supabaseMessage: input.selectUsed ? `select=${input.selectUsed}` : undefined,
  });
}

export async function resolvePortalClientContract(
  admin: SupabaseClient,
  validated: PortalValidatedSaleScope,
): Promise<PortalContractLookupResult> {
  const sessionContractId = validated.contractId;
  const { saleId, customerId, companyId, sale } = validated;

  // 1) Contrato por sale_id da sessão
  {
    const filter = `contracts.sale_id=eq(${scopeIdFingerprint(saleId)}) order=version.desc,created_at.desc`;
    const { rows, selectUsed, error } = await runResilientContractsSelect(admin, (query) =>
      query.eq('sale_id', saleId).order('created_at', { ascending: false }).limit(20),
    );

    const scoped = rows.filter((row) => belongsToValidatedScope(row, validated));
    const picked = pickBestPortalContract(scoped);

    if (error) {
      logContractLookup({
        strategy: 'sale_id',
        filter,
        sessionContractId,
        foundContractId: null,
        rowCount: 0,
        reason: 'supabase_error',
        outcome: 'failure',
        queryError: error,
        selectUsed,
      });
    } else if (picked) {
      logContractLookup({
        strategy: 'sale_id',
        filter,
        sessionContractId,
        foundContractId: String(picked.id),
        rowCount: scoped.length,
        reason: null,
        outcome: 'success',
        selectUsed,
      });
      return {
        row: picked,
        strategy: 'sale_id',
        filter,
        rowCount: scoped.length,
        reason: null,
        selectUsed,
        queryError: null,
      };
    } else {
      logContractLookup({
        strategy: 'sale_id',
        filter,
        sessionContractId,
        foundContractId: null,
        rowCount: 0,
        reason: 'no_rows',
        outcome: 'empty',
        selectUsed,
      });
    }
  }

  // 2) Contrato pelo contractId da sessão
  if (sessionContractId) {
    const filter = `contracts.id=eq(${scopeIdFingerprint(sessionContractId)})`;
    const { rows, selectUsed, error } = await runResilientContractsSelect(admin, (query) =>
      query.eq('id', sessionContractId).limit(1),
    );

    const picked = rows[0] && belongsToValidatedScope(rows[0], validated) ? rows[0] : null;

    if (error) {
      logContractLookup({
        strategy: 'session_contract_id',
        filter,
        sessionContractId,
        foundContractId: null,
        rowCount: 0,
        reason: 'supabase_error',
        outcome: 'failure',
        queryError: error,
        selectUsed,
      });
    } else if (picked) {
      logContractLookup({
        strategy: 'session_contract_id',
        filter,
        sessionContractId,
        foundContractId: String(picked.id),
        rowCount: 1,
        reason: null,
        outcome: 'success',
        selectUsed,
      });
      return {
        row: picked,
        strategy: 'session_contract_id',
        filter,
        rowCount: 1,
        reason: null,
        selectUsed,
        queryError: null,
      };
    } else {
      logContractLookup({
        strategy: 'session_contract_id',
        filter,
        sessionContractId,
        foundContractId: null,
        rowCount: rows.length,
        reason: rows.length > 0 ? 'contract_scope_mismatch' : 'no_rows',
        outcome: 'empty',
        selectUsed,
      });
    }
  }

  // 3) Contrato ativo mais recente por customer + project + block + tenant/company
  {
    const filterParts = [
      `customer_id=eq(${scopeIdFingerprint(customerId)})`,
      `tenant_id=eq(${scopeIdFingerprint(companyId)})`,
    ];
    if (sale.project_id) filterParts.push(`project_id=eq(${scopeIdFingerprint(sale.project_id)})`);
    if (sale.block_id) filterParts.push(`block_id=eq(${scopeIdFingerprint(sale.block_id)})`);
    const filter = filterParts.join(' + ');

    const { rows, selectUsed, error } = await runResilientContractsSelect(admin, (query) => {
      let q = query.eq('customer_id', customerId).eq('tenant_id', companyId);
      if (sale.project_id) q = q.eq('project_id', sale.project_id);
      if (sale.block_id) q = q.eq('block_id', sale.block_id);
      return q.order('created_at', { ascending: false }).limit(20);
    });

    let scoped = rows.filter((row) => belongsToValidatedScope(row, validated));

    if (scoped.length === 0 && rows.length === 0) {
      const fallback = await runResilientContractsSelect(admin, (query) => {
        let q = query.eq('customer_id', customerId);
        if (sale.project_id) q = q.eq('project_id', sale.project_id);
        if (sale.block_id) q = q.eq('block_id', sale.block_id);
        return q.order('created_at', { ascending: false }).limit(20);
      });
      scoped = fallback.rows.filter((row) => {
        if (String(row.customer_id || '') !== customerId) return false;
        const tenant = String(row.tenant_id || row.company_id || '').trim();
        return !tenant || tenant === companyId;
      });
      if (fallback.error && !error) {
        logContractLookup({
          strategy: 'customer_project_block',
          filter: `${filter} (company_id fallback)`,
          sessionContractId,
          foundContractId: null,
          rowCount: 0,
          reason: 'supabase_error',
          outcome: 'failure',
          queryError: fallback.error,
          selectUsed: fallback.selectUsed,
        });
      }
    }

    const picked = pickBestPortalContract(scoped);

    if (error && scoped.length === 0) {
      return {
        row: null,
        strategy: 'customer_project_block',
        filter,
        rowCount: 0,
        reason: 'supabase_error',
        selectUsed,
        queryError: error,
      };
    }

    if (picked) {
      logContractLookup({
        strategy: 'customer_project_block',
        filter,
        sessionContractId,
        foundContractId: String(picked.id),
        rowCount: scoped.length,
        reason: null,
        outcome: 'success',
        selectUsed,
      });
      return {
        row: picked,
        strategy: 'customer_project_block',
        filter,
        rowCount: scoped.length,
        reason: null,
        selectUsed,
        queryError: null,
      };
    }

    logContractLookup({
      strategy: 'customer_project_block',
      filter,
      sessionContractId,
      foundContractId: null,
      rowCount: scoped.length,
      reason: 'no_rows',
      outcome: 'empty',
      selectUsed,
    });
  }

  return {
    row: null,
    strategy: null,
    filter: null,
    rowCount: 0,
    reason: 'contract_not_found',
    selectUsed: null,
    queryError: null,
  };
}
