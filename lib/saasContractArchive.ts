/**
 * Arquivamento soft de versões de contrato SaaS (Master).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SaasContractStepError } from '@/lib/saasContractErrors';
import { isCurrentSaasContractVersion } from '@/lib/saasContractStatus';
import type { CompanyContractRow } from '@/lib/saasContractService';

export type SaasContractArchiveKind = 'test' | 'manual';

export function isArchivedSaasContract(
  row?: { archived_at?: string | null } | null,
): boolean {
  return Boolean(row?.archived_at);
}

export function filterVisibleSaasContracts<T extends { archived_at?: string | null }>(
  contracts: T[],
  includeArchived: boolean,
): T[] {
  if (includeArchived) return contracts;
  return contracts.filter((c) => !isArchivedSaasContract(c));
}

export function findActiveVisibleSaasContract(
  contracts: CompanyContractRow[],
): CompanyContractRow | null {
  return (
    contracts.find(
      (c) => !isArchivedSaasContract(c) && isCurrentSaasContractVersion(c.status),
    ) ?? null
  );
}

export type ArchiveCompanyContractInput = {
  companyId: string;
  contractId: string;
  archivedByUserId: string;
  /** Obrigatório ao arquivar versão vigente (generated/sent/signed/…). */
  confirmActive?: boolean;
  archiveKind?: SaasContractArchiveKind;
};

export async function archiveCompanyContract(
  supabaseAdmin: SupabaseClient,
  input: ArchiveCompanyContractInput,
): Promise<CompanyContractRow> {
  const { data: row, error } = await supabaseAdmin
    .from('company_contracts')
    .select('*')
    .eq('id', input.contractId)
    .eq('company_id', input.companyId)
    .maybeSingle();

  if (error || !row) {
    throw new SaasContractStepError('validation', 'Contrato não encontrado.');
  }

  const contract = row as CompanyContractRow;

  if (isArchivedSaasContract(contract)) {
    throw new SaasContractStepError('validation', 'Este contrato já está arquivado.');
  }

  const isActiveVersion = isCurrentSaasContractVersion(contract.status);
  if (isActiveVersion && !input.confirmActive) {
    throw new SaasContractStepError(
      'validation',
      'Esta é a versão vigente do contrato. Confirme o arquivamento no modal para continuar.',
    );
  }

  const archivedAt = new Date().toISOString();
  const archiveKind = input.archiveKind || (isActiveVersion ? 'manual' : 'test');

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('company_contracts')
    .update({
      archived_at: archivedAt,
      archived_by: input.archivedByUserId,
      archive_kind: archiveKind,
    })
    .eq('id', input.contractId)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new SaasContractStepError(
      'db_save',
      updateErr?.message || 'Falha ao arquivar contrato.',
    );
  }

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: input.companyId,
    company_id: input.companyId,
    user_id: input.archivedByUserId,
    module: 'SAAS',
    action: 'CONTRACT_ARCHIVED',
    description: JSON.stringify({
      contract_id: contract.id,
      contract_number: contract.contract_number,
      version: contract.version,
      status: contract.status,
      archive_kind: archiveKind,
      was_active: isActiveVersion,
    }),
  });

  console.log('SAAS_CONTRACT_ARCHIVED', {
    companyId: input.companyId,
    contractId: input.contractId,
    version: contract.version,
    wasActive: isActiveVersion,
    archiveKind,
  });

  return updated as CompanyContractRow;
}
