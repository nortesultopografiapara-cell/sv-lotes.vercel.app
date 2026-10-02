/**
 * Fonte de verdade das assinaturas eletrônicas para o PDF assinado.
 * Alinha o endpoint /pdf à mesma leitura da tela /contracts (parties + processo).
 *
 * Não grava nem altera signed_at / token / hash / status no banco.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { excludeTerminationSignatures } from '@/lib/saleContractSignatureDocumentType';
import {
  listSignatureParties,
  listSignaturePartiesByContract,
} from '@/lib/saleContractSignatureParties';
import {
  computeAggregateSaleSignatureStatus,
  countSignedParties,
  toPartyStatusSnapshots,
} from '@/lib/saleContractSignaturePartyStatus';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import type { ContractSignatureRow } from '@/lib/saleContractSignatureService';

export type SignedPdfSignatureSource =
  | 'process_signed'
  | 'parties_aggregate'
  | 'parties_by_contract'
  | 'none';

export type ContractSignedPartiesResult = {
  contractId: string;
  process: ContractSignatureRow | null;
  parties: ContractSignaturePartyRow[];
  signedCount: number;
  totalCount: number;
  statuses: string[];
  signedAt: Array<string | null>;
  signerNames: string[];
  signatureSource: SignedPdfSignatureSource;
};

export function isProcessStatusSigned(status?: string | null): boolean {
  return String(status || '').trim().toUpperCase() === 'SIGNED';
}

export function resolveSignedPdfReadiness(input: {
  processStatus?: string | null;
  parties: Array<{
    role: string;
    status: string;
    signed_at?: string | null;
    signer_name?: string | null;
  }>;
}): {
  ready: boolean;
  signedCount: number;
  totalCount: number;
  signatureSource: SignedPdfSignatureSource;
} {
  const snapshots = toPartyStatusSnapshots(
    input.parties.map((p) => ({
      role: p.role as ContractSignaturePartyRow['role'],
      status: p.status as ContractSignaturePartyRow['status'],
      signed_at: p.signed_at,
    })),
  );
  const progress = countSignedParties(snapshots);
  const aggregate = computeAggregateSaleSignatureStatus(snapshots);
  const processSigned = isProcessStatusSigned(input.processStatus);
  const allPartiesSigned =
    progress.total > 0 && progress.signed >= progress.total;

  if (processSigned) {
    return {
      ready: true,
      signedCount: progress.signed,
      totalCount: progress.total,
      signatureSource: 'process_signed',
    };
  }
  if (aggregate === 'SIGNED' || allPartiesSigned) {
    return {
      ready: true,
      signedCount: progress.signed,
      totalCount: progress.total,
      signatureSource: 'parties_aggregate',
    };
  }
  return {
    ready: false,
    signedCount: progress.signed,
    totalCount: progress.total,
    signatureSource: 'none',
  };
}

function packResult(input: {
  contractId: string;
  process: ContractSignatureRow | null;
  parties: ContractSignaturePartyRow[];
  signatureSource: SignedPdfSignatureSource;
}): ContractSignedPartiesResult {
  const progress = countSignedParties(input.parties);
  return {
    contractId: input.contractId,
    process: input.process,
    parties: input.parties,
    signedCount: progress.signed,
    totalCount: progress.total,
    statuses: input.parties.map((p) => String(p.status || '')),
    signedAt: input.parties.map((p) => p.signed_at || null),
    signerNames: input.parties
      .map((p) => String(p.signer_name || '').trim())
      .filter(Boolean),
    signatureSource: input.signatureSource,
  };
}

async function listProcessesByContractId(
  supabaseAdmin: SupabaseClient,
  contractId: string,
): Promise<ContractSignatureRow[]> {
  const { data, error } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[SIGNED PDF TRACE] list processes failed', {
      contractId: contractId.slice(0, 8),
      message: error.message,
    });
    return [];
  }
  return excludeTerminationSignatures((data || []) as ContractSignatureRow[]);
}

async function loadProcessById(
  supabaseAdmin: SupabaseClient,
  processId: string,
): Promise<ContractSignatureRow | null> {
  const { data, error } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('id', processId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ContractSignatureRow;
  if (excludeTerminationSignatures([row]).length === 0) return null;
  return row;
}

/**
 * Mesma leitura da tela /contracts: processo mais recente + parties.
 * Aceita processo SIGNED (qualquer casing) OU 3/3 parties SIGNED mesmo
 * se o campo legado contract.signature_status / vendor_signed_at estiver vazio.
 */
export async function getContractSignedParties(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  options?: {
    saleId?: string | null;
    regeneratedFrom?: string | null;
  },
): Promise<ContractSignedPartiesResult> {
  const id = String(contractId || '').trim();
  const empty = packResult({
    contractId: id,
    process: null,
    parties: [],
    signatureSource: 'none',
  });
  if (!id) return empty;

  const tryContractIds = [id];
  const regeneratedFrom = String(options?.regeneratedFrom || '').trim();
  if (regeneratedFrom && regeneratedFrom !== id) {
    tryContractIds.push(regeneratedFrom);
  }

  for (const lookupId of tryContractIds) {
    const processes = await listProcessesByContractId(supabaseAdmin, lookupId);
    for (const process of processes) {
      const parties = await listSignatureParties(supabaseAdmin, process.id);
      const readiness = resolveSignedPdfReadiness({
        processStatus: process.signature_status,
        parties,
      });
      if (readiness.ready) {
        return packResult({
          contractId: id,
          process,
          parties,
          signatureSource: readiness.signatureSource,
        });
      }
    }

    const byContract = await listSignaturePartiesByContract(supabaseAdmin, lookupId);
    const readiness = resolveSignedPdfReadiness({
      processStatus: null,
      parties: byContract,
    });
    if (readiness.ready) {
      const processId = String(byContract[0]?.contract_signature_id || '').trim();
      const process = processId
        ? await loadProcessById(supabaseAdmin, processId)
        : null;
      return packResult({
        contractId: id,
        process,
        parties: byContract,
        signatureSource: 'parties_by_contract',
      });
    }
  }

  const saleId = String(options?.saleId || '').trim();
  if (saleId) {
    const { data, error } = await supabaseAdmin
      .from('contract_signature_parties')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      const parties = data as ContractSignaturePartyRow[];
      const readiness = resolveSignedPdfReadiness({
        processStatus: null,
        parties,
      });
      if (readiness.ready) {
        const processId = String(parties[0]?.contract_signature_id || '').trim();
        const process = processId
          ? await loadProcessById(supabaseAdmin, processId)
          : null;
        return packResult({
          contractId: id,
          process,
          parties,
          signatureSource: 'parties_by_contract',
        });
      }
    }
  }

  return empty;
}

/** Não persiste — só preenche o contexto in-memory para emitir certificado/PDF. */
export function hydrateSignatureRowForSignedPdf(
  process: ContractSignatureRow,
  parties: ContractSignaturePartyRow[],
): ContractSignatureRow {
  const signed = parties.filter(
    (p) => String(p.status || '').toUpperCase() === 'SIGNED',
  );
  const buyer = signed.find((p) => String(p.role).toUpperCase() === 'BUYER');
  const vendors = signed.filter((p) => String(p.role).toUpperCase() === 'VENDOR');
  const lastVendor = [...vendors].sort((a, b) =>
    String(a.signed_at || '').localeCompare(String(b.signed_at || '')),
  ).at(-1);

  return {
    ...process,
    signature_status: 'SIGNED',
    signed_at: process.signed_at || buyer?.signed_at || lastVendor?.signed_at || process.created_at,
    vendor_signed_at:
      process.vendor_signed_at || lastVendor?.signed_at || process.signed_at,
    vendor_signer_name:
      process.vendor_signer_name || lastVendor?.signer_name || null,
    vendor_signer_document:
      process.vendor_signer_document || lastVendor?.signer_cpf || null,
    vendor_signer_email:
      process.vendor_signer_email || lastVendor?.signer_email || null,
    signer_name: process.signer_name || buyer?.signer_name || null,
    signer_document: process.signer_document || buyer?.signer_cpf || null,
    signer_email: process.signer_email || buyer?.signer_email || null,
  };
}

export function logSignedPdfTrace(
  extra: Record<string, unknown>,
): void {
  console.info('[SIGNED PDF TRACE]', extra);
}
