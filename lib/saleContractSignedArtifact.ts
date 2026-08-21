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
  getLatestSignedSaleSignature,
  loadSaleContractPdfForSign,
  loadSaleSignPageContext,
} from '@/lib/saleContractSignatureService';
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
 * Requer processo SIGNED (getLatestSignedSaleSignature) e/ou pdf_signed_url.
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
      .select('id, contract_number, status, signature_status, pdf_signed_url, tenant_id, company_id')
      .eq('id', id)
      .maybeSingle();
    row = (data as Record<string, unknown>) || null;
  }
  if (!row) return null;

  const contractNumber = String(row.contract_number || id).trim();
  const signature = await getLatestSignedSaleSignature(supabaseAdmin, id);

  if (signature) {
    try {
      const signContext = await loadSaleSignPageContext(supabaseAdmin, signature);
      const { pdf, contractNumber: num } = await loadSaleContractPdfForSign(
        supabaseAdmin,
        id,
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
      console.warn('[SIGNED_SALE_ARTIFACT] regeneration failed', {
        contractId: id.slice(0, 8),
        message: regenErr instanceof Error ? regenErr.message : String(regenErr),
      });
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
