/**
 * Numeração sequencial de contratos SaaS: NNNNN/AAAA (reinicia a cada ano).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const CONTRACT_NUMBER_PATTERN = /^(\d{5})\/(\d{4})$/;

export function formatCompanyContractNumber(seq: number, year?: number): string {
  const y = year ?? new Date().getFullYear();
  return `${String(seq).padStart(5, '0')}/${y}`;
}

export function isNewFormatCompanyContractNumber(value: string | null | undefined): boolean {
  return Boolean(value && CONTRACT_NUMBER_PATTERN.test(String(value).trim()));
}

function parseMaxSeqForYear(
  numbers: Array<{ contract_number?: string | null }>,
  year: number,
): number {
  let max = 0;
  for (const row of numbers) {
    const raw = String(row.contract_number || '').trim();
    const match = raw.match(CONTRACT_NUMBER_PATTERN);
    if (!match) continue;
    const seq = Number(match[1]);
    const y = Number(match[2]);
    if (y === year && Number.isFinite(seq)) {
      max = Math.max(max, seq);
    }
  }
  return max;
}

/** Fallback quando a RPC ainda não foi aplicada no banco. */
async function generateNextCompanyContractNumberFallback(
  supabaseAdmin: SupabaseClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const yearSuffix = `/${year}`;

  const [{ data: subs }, { data: contracts }] = await Promise.all([
    supabaseAdmin
      .from('company_subscriptions')
      .select('contract_number')
      .like('contract_number', `%${yearSuffix}`),
    supabaseAdmin
      .from('company_contracts')
      .select('contract_number')
      .like('contract_number', `%${yearSuffix}`),
  ]);

  const max = parseMaxSeqForYear([...(subs || []), ...(contracts || [])], year);
  return formatCompanyContractNumber(max + 1, year);
}

/**
 * Gera o próximo número de contrato SaaS de forma transacional (RPC Postgres).
 * Formato: 00001/2026, 00002/2026, … reinicia em 00001/AAAA a cada ano.
 */
export async function generateNextCompanyContractNumber(
  supabaseAdmin: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('generate_next_company_contract_number');

  if (!error && typeof data === 'string' && isNewFormatCompanyContractNumber(data)) {
    return data;
  }

  if (error) {
    console.warn('[COMPANY_CONTRACT_NUMBER] RPC fallback:', error.message);
  }

  return generateNextCompanyContractNumberFallback(supabaseAdmin);
}
