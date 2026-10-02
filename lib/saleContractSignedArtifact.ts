/**
 * Artefato final assinado de contrato de venda — fonte canônica compartilhada.
 *
 * Admin (`/api/contracts/[id]/pdf`) e Portal do Cliente usam a mesma resolução:
 * 1) regeneração ELECTRONIC_SIGNED (mesmo pipeline do e-sign);
 * 2) fallback `contracts.pdf_signed_url` persistido.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSaleContractFullySigned } from '@/lib/saleContractDashboardStats';
import { fetchPdfBytesFromUrl } from '@/lib/saasContractPdfHttp';
import {
  loadSaleContractPdfForSign,
  loadSaleSignPageContext,
} from '@/lib/saleContractSignatureService';
import {
  getContractSignedParties,
  hydrateSignatureRowForSignedPdf,
  logSignedPdfTrace,
  resolveSignedPdfDocumentContractId,
} from '@/lib/saleContractSignedParties';
import { shouldBlockUnsignedFallbackAfterElectronicSign } from '@/lib/saleContractSignatureRenderMode';

export type SignedSaleContractArtifactSource =
  | 'regenerated_signed'
  | 'pdf_signed_url';

export type SignedSaleContractArtifact = {
  bytes: Uint8Array;
  source: SignedSaleContractArtifactSource;
  contractNumber: string;
  contractId: string;
};

/** Meta síncrona — UI Portal/admin: há artefato final (URL ou processo SIGNED). */
export function resolveSignedContractArtifactMeta(contract: {
  id?: string | null;
  status?: string | null;
  signature_status?: string | null;
  pdf_signed_url?: string | null;
  contract_number?: string | null;
}): {
  hasStoredSignedUrl: boolean;
  isFullySigned: boolean;
  /** Portal pode habilitar visualizar/baixar assinado (não “em processamento”). */
  signedArtifactAvailable: boolean;
  pdfSignedUrl: string | null;
  contractNumber: string;
} {
  const pdfSignedUrl = String(contract.pdf_signed_url || '').trim() || null;
  const hasStoredSignedUrl = Boolean(pdfSignedUrl);
  const isFullySigned = isSaleContractFullySigned(contract);
  const blockUnsigned = shouldBlockUnsignedFallbackAfterElectronicSign({
    signatureStatus: contract.signature_status,
    contractStatus: contract.status,
    pdfSignedUrl,
  });
  // Mesma regra do botão admin: processo concluído OU URL persistida.
  // Download usará loadSignedSaleContractArtifact (regen + URL), igual ao admin.
  const signedArtifactAvailable = hasStoredSignedUrl || isFullySigned || blockUnsigned;
  return {
    hasStoredSignedUrl,
    isFullySigned,
    signedArtifactAvailable,
    pdfSignedUrl,
    contractNumber: String(contract.contract_number || contract.id || '').trim(),
  };
}

/**
 * Carrega bytes do PDF assinado — mesma ordem do endpoint admin.
 * Fonte de verdade: parties (igual à tela /contracts) + processo, não só
 * contract_signatures.signature_status = 'SIGNED' exato.
 */
export async function loadSignedSaleContractArtifact(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  contractRow?: Record<string, unknown> | null,
): Promise<SignedSaleContractArtifact | null> {
  const id = String(contractId || '').trim();
  if (!id) return null;

  let row = contractRow || null;
  if (!row) {
    const { data } = await supabaseAdmin
      .from('contracts')
      .select('id, contract_number, status, signature_status, pdf_signed_url, pdf_url, tenant_id, company_id, sale_id, regenerated_from')
      .eq('id', id)
      .maybeSingle();
    row = (data as Record<string, unknown>) || null;
  }
  if (!row) return null;

  const contractNumber = String(row.contract_number || id).trim();
  const resolved = await getContractSignedParties(supabaseAdmin, id, {
    saleId: String(row.sale_id || '').trim() || null,
    regeneratedFrom: String(row.regenerated_from || '').trim() || null,
    contractNumber: String(row.contract_number || '').trim() || null,
  });

  logSignedPdfTrace({
    contractId: id,
    contractNumber,
    uiSignatureParties: resolved.signerNames,
    pdfSignatureParties: resolved.signerNames,
    signedCount: resolved.signedCount,
    totalCount: resolved.totalCount,
    statuses: resolved.statuses,
    signedAt: resolved.signedAt,
    signatureSource: resolved.signatureSource,
    processStatus: resolved.process?.signature_status || null,
    processId: resolved.process?.id || null,
    legacyContractSignatureStatus: row.signature_status || null,
    legacyContractStatus: row.status || null,
  });

  const documentContractId = resolveSignedPdfDocumentContractId({
    requestedContractId: id,
    signatureProcessId: resolved.process?.id,
    signatureContractId: resolved.process?.contract_id,
    partyContractId: resolved.parties[0]?.contract_id,
  });

  const signature = resolved.process
    ? hydrateSignatureRowForSignedPdf(
        resolved.process,
        resolved.parties,
        documentContractId,
      )
    : null;

  if (resolved.signatureSource !== 'none') {
    if (!signature) {
      throw new Error(
        'Assinaturas eletrônicas encontradas nas parties, mas o processo (contract_signatures) não foi localizado.',
      );
    }
    try {
      console.info('[LF SIGNED PDF STAGE]', {
        stage: 'contract_lookup',
        requestedContractId: id,
        lookupContractId: documentContractId,
        signatureProcessId: signature.id,
        saleId: row.sale_id || null,
        physicalPdfContractId: documentContractId,
        regeneratedFrom: row.regenerated_from || null,
      });
      const signContext = await loadSaleSignPageContext(supabaseAdmin, signature, {
        documentContractId,
      });
      console.info('[LF SIGNED PDF STAGE]', {
        stage: 'physical_pdf_lookup',
        requestedContractId: id,
        lookupContractId: documentContractId,
        pdfUrl: String(row.pdf_url || signContext.contract.pdf_url || '').trim() || null,
      });
      const { pdf, contractNumber: num } = await loadSaleContractPdfForSign(
        supabaseAdmin,
        documentContractId,
        { signature, signContext },
      );
      if (pdf.byteLength >= 5) {
        return {
          bytes: pdf,
          source: 'regenerated_signed',
          contractNumber: num || contractNumber,
          contractId: id,
        };
      }
    } catch (regenErr) {
      console.error('[SIGNED PDF TRACE] generation failed', {
        contractId: id.slice(0, 8),
        contractNumber,
        signedCount: resolved.signedCount,
        signatureSource: resolved.signatureSource,
        message: regenErr instanceof Error ? regenErr.message : String(regenErr),
      });
      const storedSignedUrl = String(row.pdf_signed_url || '').trim();
      if (storedSignedUrl) {
        const bytes = await fetchPdfBytesFromUrl(storedSignedUrl);
        if (bytes && bytes.byteLength >= 5) {
          return {
            bytes,
            source: 'pdf_signed_url',
            contractNumber,
            contractId: id,
          };
        }
      }
      throw regenErr;
    }
  }

  const storedSignedUrl = String(row.pdf_signed_url || '').trim();
  if (storedSignedUrl) {
    const bytes = await fetchPdfBytesFromUrl(storedSignedUrl);
    if (bytes && bytes.byteLength >= 5) {
      return {
        bytes,
        source: 'pdf_signed_url',
        contractNumber,
        contractId: id,
      };
    }
  }

  return null;
}
