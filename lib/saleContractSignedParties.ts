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
  | 'lineage'
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
  lineageContractIds: string[];
  processRows: Array<{
    id: string;
    contract_id: string;
    signature_status: string | null;
    created_at: string | null;
  }>;
  partyRows: Array<{
    id: string;
    contract_id: string | null;
    contract_signature_id: string | null;
    role: string;
    status: string;
    signer_name: string | null;
    signed_at: string | null;
  }>;
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

function summarizeProcesses(rows: ContractSignatureRow[]) {
  return rows.map((row) => ({
    id: String(row.id || ''),
    contract_id: String(row.contract_id || ''),
    signature_status: row.signature_status || null,
    created_at: row.created_at || null,
  }));
}

function summarizeParties(rows: ContractSignaturePartyRow[]) {
  return rows.map((row) => ({
    id: String(row.id || ''),
    contract_id: row.contract_id || null,
    contract_signature_id: row.contract_signature_id || null,
    role: String(row.role || ''),
    status: String(row.status || ''),
    signer_name: row.signer_name || null,
    signed_at: row.signed_at || null,
  }));
}

function packResult(input: {
  contractId: string;
  process: ContractSignatureRow | null;
  parties: ContractSignaturePartyRow[];
  signatureSource: SignedPdfSignatureSource;
  lineageContractIds?: string[];
  processRows?: ContractSignatureRow[];
  extraPartyRows?: ContractSignaturePartyRow[];
}): ContractSignedPartiesResult {
  const progress = countSignedParties(input.parties);
  const processRows = summarizeProcesses(input.processRows || (input.process ? [input.process] : []));
  const partyRows = summarizeParties(
    input.extraPartyRows && input.extraPartyRows.length
      ? input.extraPartyRows
      : input.parties,
  );
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
    lineageContractIds: input.lineageContractIds || [input.contractId],
    processRows,
    partyRows,
  };
}

export async function collectContractLineageIds(
  supabaseAdmin: SupabaseClient,
  input: {
    contractId: string;
    saleId?: string | null;
    regeneratedFrom?: string | null;
    contractNumber?: string | null;
  },
): Promise<string[]> {
  const ids: string[] = [];
  const add = (value?: string | null) => {
    const id = String(value || '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  add(input.contractId);

  let saleId = String(input.saleId || '').trim();
  let regeneratedFrom = String(input.regeneratedFrom || '').trim();
  let contractNumber = String(input.contractNumber || '').trim();

  if (input.contractId) {
    const { data } = await supabaseAdmin
      .from('contracts')
      .select('id, regenerated_from, sale_id, contract_number, version')
      .eq('id', input.contractId)
      .maybeSingle();
    if (data) {
      const row = data as {
        id?: string;
        regenerated_from?: string | null;
        sale_id?: string | null;
        contract_number?: string | null;
      };
      add(row.id);
      if (!regeneratedFrom) regeneratedFrom = String(row.regenerated_from || '').trim();
      if (!saleId) saleId = String(row.sale_id || '').trim();
      if (!contractNumber) contractNumber = String(row.contract_number || '').trim();
    }
  }

  add(regeneratedFrom);

  let walk = regeneratedFrom;
  for (let i = 0; i < 20 && walk; i += 1) {
    const { data } = await supabaseAdmin
      .from('contracts')
      .select('id, regenerated_from, sale_id, contract_number')
      .eq('id', walk)
      .maybeSingle();
    if (!data) break;
    add((data as { id?: string }).id);
    walk = String((data as { regenerated_from?: string | null }).regenerated_from || '').trim();
    add(walk);
  }

  if (saleId) {
    const { data } = await supabaseAdmin
      .from('contracts')
      .select('id, regenerated_from')
      .eq('sale_id', saleId);
    for (const row of data || []) {
      add((row as { id?: string }).id);
      add((row as { regenerated_from?: string | null }).regenerated_from);
    }
  }

  if (contractNumber) {
    const { data } = await supabaseAdmin
      .from('contracts')
      .select('id, regenerated_from')
      .eq('contract_number', contractNumber);
    for (const row of data || []) {
      add((row as { id?: string }).id);
      add((row as { regenerated_from?: string | null }).regenerated_from);
    }
  }

  return ids;
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
    contractNumber?: string | null;
  },
): Promise<ContractSignedPartiesResult> {
  const id = String(contractId || '').trim();
  const lineageContractIds = id
    ? await collectContractLineageIds(supabaseAdmin, {
        contractId: id,
        saleId: options?.saleId,
        regeneratedFrom: options?.regeneratedFrom,
        contractNumber: options?.contractNumber,
      })
    : [];
  const empty = packResult({
    contractId: id,
    process: null,
    parties: [],
    signatureSource: 'none',
    lineageContractIds,
  });
  if (!id) return empty;

  const allProcesses: ContractSignatureRow[] = [];
  const allParties: ContractSignaturePartyRow[] = [];

  for (const lookupId of lineageContractIds) {
    const processes = await listProcessesByContractId(supabaseAdmin, lookupId);
    allProcesses.push(...processes);
    for (const process of processes) {
      const parties = await listSignatureParties(supabaseAdmin, process.id);
      allParties.push(...parties);
      const readiness = resolveSignedPdfReadiness({
        processStatus: process.signature_status,
        parties,
      });
      if (readiness.ready) {
        return packResult({
          contractId: id,
          process,
          parties,
          signatureSource:
            lookupId === id ? readiness.signatureSource : 'lineage',
          lineageContractIds,
          processRows: allProcesses,
          extraPartyRows: allParties,
        });
      }
    }

    const byContract = await listSignaturePartiesByContract(supabaseAdmin, lookupId);
    allParties.push(...byContract);
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
        signatureSource: lookupId === id ? 'parties_by_contract' : 'lineage',
        lineageContractIds,
        processRows: allProcesses,
        extraPartyRows: allParties,
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
      allParties.push(...parties);
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
          signatureSource: 'lineage',
          lineageContractIds,
          processRows: allProcesses,
          extraPartyRows: allParties,
        });
      }
    }
  }

  const leftover = resolveSignedPdfReadiness({
    processStatus: allProcesses[0]?.signature_status || null,
    parties: allParties,
  });
  if (leftover.ready || (leftover.totalCount > 0 && leftover.signedCount >= leftover.totalCount)) {
    const processId = String(
      allParties.find((p) => String(p.status || '').toUpperCase() === 'SIGNED')
        ?.contract_signature_id ||
        allProcesses[0]?.id ||
        '',
    ).trim();
    const process = processId
      ? allProcesses.find((row) => row.id === processId) ||
        (await loadProcessById(supabaseAdmin, processId))
      : allProcesses[0] || null;
    return packResult({
      contractId: id,
      process,
      parties: allParties,
      signatureSource: leftover.signatureSource === 'none' ? 'lineage' : leftover.signatureSource,
      lineageContractIds,
      processRows: allProcesses,
      extraPartyRows: allParties,
    });
  }

  return packResult({
    contractId: id,
    process: allProcesses[0] || null,
    parties: allParties,
    signatureSource: 'none',
    lineageContractIds,
    processRows: allProcesses,
    extraPartyRows: allParties,
  });
}

/**
 * PDF-base / freeze sempre usam o contracts.id pedido pela rota.
 * Nunca o ID do processo de assinatura nem o ID de uma party.
 */
export function resolveSignedPdfDocumentContractId(input: {
  requestedContractId: string;
  signatureProcessId?: string | null;
  signatureContractId?: string | null;
  partyContractId?: string | null;
}): string {
  const requested = String(input.requestedContractId || '').trim();
  const processId = String(input.signatureProcessId || '').trim();
  if (!requested) {
    throw new Error('requestedContractId vazio para o PDF assinado.');
  }
  if (processId && requested === processId) {
    throw new Error(
      `contractId não pode ser o ID do processo de assinatura (${processId}).`,
    );
  }
  return requested;
}

/** Não persiste — só preenche o contexto in-memory para emitir certificado/PDF. */
export function hydrateSignatureRowForSignedPdf(
  process: ContractSignatureRow,
  parties: ContractSignaturePartyRow[],
  documentContractId?: string | null,
): ContractSignatureRow {
  const signed = parties.filter(
    (p) => String(p.status || '').toUpperCase() === 'SIGNED',
  );
  const buyer = signed.find((p) => String(p.role).toUpperCase() === 'BUYER');
  const vendors = signed.filter((p) => String(p.role).toUpperCase() === 'VENDOR');
  const lastVendor = [...vendors].sort((a, b) =>
    String(a.signed_at || '').localeCompare(String(b.signed_at || '')),
  ).at(-1);
  const processId = String(process.id || '').trim();
  const contractId = resolveSignedPdfDocumentContractId({
    requestedContractId: String(
      documentContractId || process.contract_id || '',
    ).trim(),
    signatureProcessId: processId,
    signatureContractId: process.contract_id,
    partyContractId: parties[0]?.contract_id,
  });

  return {
    ...process,
    contract_id: contractId,
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
