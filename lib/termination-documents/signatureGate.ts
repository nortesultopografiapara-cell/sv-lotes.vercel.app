/**
 * Gate de assinatura do TERMO: valida o instrumento de desistência,
 * não a vigência comercial do contrato original.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canceledOriginalContractBlocksSignature,
  isSignedSaleContractStatus,
  isTerminationSaleSignature,
} from '@/lib/saleContractSignatureDocumentType';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureErrors';
import { loadTerminationDocumentBySale } from '@/lib/termination-documents/persist';

const CANCELED_CONTRACT_SIGN_MESSAGE =
  'Contrato cancelado. Assinatura não permitida.';

export async function assertTerminationInstrumentReadyToSign(
  admin: SupabaseClient,
  signature: {
    signed_document_type?: string | null;
    contract_id: string;
    tenant_id?: string | null;
  },
): Promise<void> {
  if (!isTerminationSaleSignature(signature)) return;

  const { data: contract } = await admin
    .from('contracts')
    .select('id, sale_id, company_id, tenant_id')
    .eq('id', signature.contract_id)
    .maybeSingle();

  const saleId = String(contract?.sale_id || '').trim();
  const companyId = String(
    contract?.company_id || contract?.tenant_id || signature.tenant_id || '',
  ).trim();

  if (!saleId || !companyId) {
    throw new SaleContractSignatureError(
      'Termo de desistência não encontrado para este link.',
    );
  }

  const loaded = await loadTerminationDocumentBySale(admin, {
    saleId,
    companyId,
  });
  if (!loaded) {
    throw new SaleContractSignatureError(
      'Termo de desistência não encontrado para este link.',
    );
  }
  if (String(loaded.settlementStatus || '').toUpperCase() !== 'EXECUTED') {
    throw new SaleContractSignatureError(
      'O acerto financeiro ainda não está encerrado. A assinatura do termo não é permitida.',
    );
  }
  if (!loaded.snapshot) {
    throw new SaleContractSignatureError(
      'Snapshot documental ausente. O conteúdo financeiro não será reconstruído.',
    );
  }
  if (!loaded.documentId) {
    throw new SaleContractSignatureError(
      'O documento original do termo não está disponível para assinatura.',
    );
  }
  if (
    loaded.documentStatus !== 'GENERATED' &&
    loaded.documentStatus !== 'SIGNED'
  ) {
    throw new SaleContractSignatureError(
      'O termo ainda não está disponível para assinatura.',
    );
  }
}

export async function assertOriginalContractAllowsElectronicSignature(
  admin: SupabaseClient,
  signature: {
    signed_document_type?: string | null;
    contract_id: string;
    tenant_id?: string | null;
  },
  contractStatus: string,
  options?: { skipAlreadySignedCheck?: boolean },
): Promise<void> {
  if (
    canceledOriginalContractBlocksSignature({
      signedDocumentType: signature.signed_document_type,
      contractStatus,
    })
  ) {
    throw new SaleContractSignatureError(CANCELED_CONTRACT_SIGN_MESSAGE);
  }

  if (isTerminationSaleSignature(signature)) {
    await assertTerminationInstrumentReadyToSign(admin, signature);
    return;
  }

  if (options?.skipAlreadySignedCheck) return;

  if (isSignedSaleContractStatus(contractStatus)) {
    throw new SaleContractSignatureError(
      'Este contrato já possui assinatura registrada.',
    );
  }
}
