/**
 * Estimativa prévia F2 — sem gerar pacote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMPANY_EXPORT_PACKAGE_SPLIT_BYTES,
} from '@/lib/master/companyExport/storageRegistry';

export const COMPANY_EXPORT_HEAVY_BLOCKS_THRESHOLD = 500;
export const COMPANY_EXPORT_HEAVY_MB_THRESHOLD = 450;

export type CompanyExportEstimate = {
  companyId: string;
  blocks: number;
  projects: number;
  saleDocuments: number;
  legacyDocuments: number;
  contracts: number;
  geometryLotsEstimate: number;
  memorialsIfEnabled: number;
  lotPlansIfEnabled: number;
  generalPlansIfEnabled: number;
  estimatedBinaryMbWithPlans: number;
  estimatedBinaryMbWithoutPlans: number;
  packageSplitLikelyWithPlans: boolean;
  packageSplitLikelyWithoutPlans: boolean;
  requiresExtraConfirmWithPlans: boolean;
  requiresExtraConfirmWithoutPlans: boolean;
  estimatedMinutesWithPlans: string;
  note: string;
};

async function countOr(
  admin: SupabaseClient,
  table: string,
  companyId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`);
  if (error) return 0;
  return count || 0;
}

async function countEq(
  admin: SupabaseClient,
  table: string,
  column: string,
  companyId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, companyId);
  if (error) return 0;
  return count || 0;
}

export async function estimateCompanyExport(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyExportEstimate> {
  const [blocks, projects, saleDocuments, legacyDocuments, contracts] = await Promise.all([
    countOr(admin, 'blocks', companyId),
    countOr(admin, 'projects', companyId),
    countOr(admin, 'sale_documents', companyId),
    countOr(admin, 'legacy_contract_documents', companyId),
    countOr(admin, 'contracts', companyId),
  ]);

  // Heurística: maioria dos lotes com geometria em empresas GIS
  const geometryLotsEstimate = Math.round(blocks * 0.85);
  const memorialsIfEnabled = geometryLotsEstimate;
  const lotPlansIfEnabled = geometryLotsEstimate;
  const generalPlansIfEnabled = projects;

  const avgDocMb = 0.7;
  const avgPlanMb = 0.35;
  const storageMb = (saleDocuments + legacyDocuments + Math.min(contracts, 50)) * avgDocMb;
  const plansMb =
    (memorialsIfEnabled + lotPlansIfEnabled + generalPlansIfEnabled) * avgPlanMb;
  const estimatedBinaryMbWithoutPlans = Number(storageMb.toFixed(1));
  const estimatedBinaryMbWithPlans = Number((storageMb + plansMb).toFixed(1));

  const packageSplitLikelyWithPlans =
    estimatedBinaryMbWithPlans * 1024 * 1024 > COMPANY_EXPORT_PACKAGE_SPLIT_BYTES;
  const packageSplitLikelyWithoutPlans =
    estimatedBinaryMbWithoutPlans * 1024 * 1024 > COMPANY_EXPORT_PACKAGE_SPLIT_BYTES;

  const requiresExtraConfirmWithPlans =
    blocks >= COMPANY_EXPORT_HEAVY_BLOCKS_THRESHOLD ||
    estimatedBinaryMbWithPlans >= COMPANY_EXPORT_HEAVY_MB_THRESHOLD ||
    packageSplitLikelyWithPlans;
  const requiresExtraConfirmWithoutPlans =
    blocks >= COMPANY_EXPORT_HEAVY_BLOCKS_THRESHOLD ||
    estimatedBinaryMbWithoutPlans >= COMPANY_EXPORT_HEAVY_MB_THRESHOLD;

  let estimatedMinutesWithPlans = '5–20';
  if (blocks > 1000 || estimatedBinaryMbWithPlans > 1000) estimatedMinutesWithPlans = '60–180+';
  else if (blocks > 200 || estimatedBinaryMbWithPlans > 200) estimatedMinutesWithPlans = '15–60';

  // also probe company row exists
  await countEq(admin, 'companies', 'id', companyId);

  return {
    companyId,
    blocks,
    projects,
    saleDocuments,
    legacyDocuments,
    contracts,
    geometryLotsEstimate,
    memorialsIfEnabled,
    lotPlansIfEnabled,
    generalPlansIfEnabled,
    estimatedBinaryMbWithPlans,
    estimatedBinaryMbWithoutPlans,
    packageSplitLikelyWithPlans,
    packageSplitLikelyWithoutPlans,
    requiresExtraConfirmWithPlans,
    requiresExtraConfirmWithoutPlans,
    estimatedMinutesWithPlans,
    note:
      'Estimativa heurística (não inventaria Storage completo). Empresas grandes exigem confirmação adicional quando planos estiverem ligados.',
  };
}
