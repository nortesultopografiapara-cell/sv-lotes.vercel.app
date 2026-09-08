/**
 * Paginação READ-ONLY de cash_movements e broker_commissions (Dashboard / totais).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RlsContext } from '@/lib/rls';
import {
  fetchAllTenantRowsPaged,
  type FetchAllTenantRowsResult,
} from '@/lib/finance/fetchTenantRowsPaged';

export const DASHBOARD_CASH_MOVEMENTS_SELECT = '*';
export const DASHBOARD_CASH_MOVEMENTS_SELECT_FALLBACK = `
  id, status, type, amount, movement_date, created_at, sale_id, broker_id,
  finance_receipt_id, project_id, contract_id, metadata, description
`;

export const DASHBOARD_BROKER_COMMISSIONS_SELECT = '*';
export const DASHBOARD_BROKER_COMMISSIONS_SELECT_FALLBACK = `
  id, status, amount, paid_at, created_at, sale_id, broker_id, contract_id
`;

export async function fetchAllCashMovementsPaged<T = Record<string, unknown>>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select?: string;
  selectFallback?: string;
  fetchPageSize?: number;
  postgrestMaxRows?: number;
}): Promise<FetchAllTenantRowsResult<T>> {
  return fetchAllTenantRowsPaged<T>({
    supabase: params.supabase,
    rlsCtx: params.rlsCtx,
    table: 'cash_movements',
    select: params.select ?? DASHBOARD_CASH_MOVEMENTS_SELECT,
    selectFallback:
      params.selectFallback ?? DASHBOARD_CASH_MOVEMENTS_SELECT_FALLBACK,
    orderColumn: 'created_at',
    orderSecondary: 'id',
    fetchPageSize: params.fetchPageSize,
    postgrestMaxRows: params.postgrestMaxRows,
  });
}

export async function fetchAllBrokerCommissionsPaged<T = Record<string, unknown>>(params: {
  supabase: SupabaseClient;
  rlsCtx: RlsContext;
  select?: string;
  selectFallback?: string;
  fetchPageSize?: number;
  postgrestMaxRows?: number;
}): Promise<FetchAllTenantRowsResult<T>> {
  return fetchAllTenantRowsPaged<T>({
    supabase: params.supabase,
    rlsCtx: params.rlsCtx,
    table: 'broker_commissions',
    select: params.select ?? DASHBOARD_BROKER_COMMISSIONS_SELECT,
    selectFallback:
      params.selectFallback ?? DASHBOARD_BROKER_COMMISSIONS_SELECT_FALLBACK,
    orderColumn: 'created_at',
    orderSecondary: 'id',
    fetchPageSize: params.fetchPageSize,
    postgrestMaxRows: params.postgrestMaxRows,
  });
}
