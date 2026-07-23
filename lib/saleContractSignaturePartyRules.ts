/**
 * Regras de inclusão e validação do cônjuge como signatário eletrônico.
 * Fase atual: apenas RECANTO_PRIMAVERA (campo CÔNJUGE ANUENTE no PDF).
 */

import { isValidSignerEmail } from '@/lib/saleContractEmailValidation';
import {
  normalizeSaleContractModel,
  type SaleContractModel,
} from '@/lib/contractModel';
import { onlyDigits } from '@/lib/inputMasks';
import {
  extractRecantoSpouseSource,
  hasSaleSpouseData,
} from '@/lib/saleSpouseFields';

/** Modelos com slot PDF próprio para cônjuge — habilitados nesta fase. */
export const SPOUSE_ELECTRONIC_SIGNATURE_MODELS: SaleContractModel[] = [
  'RECANTO_PRIMAVERA',
];

export const SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE =
  'O contrato possui cônjuge anuente, mas os dados necessários para a assinatura estão incompletos. Informe o nome, o CPF e pelo menos um telefone ou e-mail do cônjuge.';

export function supportsSpouseElectronicSignature(
  contractModel: unknown,
): boolean {
  const model = normalizeSaleContractModel(contractModel);
  return SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes(model);
}

/**
 * Cônjuge é signatário eletrônico somente quando o modelo tem slot PDF
 * e a venda inclui o cônjuge no contrato gerado (sale_spouse_*).
 */
export function shouldCreateSpouseSignatureParty(params: {
  contractModel: unknown;
  sale: Record<string, unknown> | null | undefined;
  contractHtml?: string | null;
}): boolean {
  if (!supportsSpouseElectronicSignature(params.contractModel)) {
    return false;
  }
  if (!hasSaleSpouseData(params.sale)) {
    return false;
  }
  const html = String(params.contractHtml || '');
  if (html && !html.includes('CÔNJUGE ANUENTE')) {
    return false;
  }
  return true;
}

export type SpouseSignatureValidationResult =
  | { ok: true; name: string; cpf: string; phone: string; email: string }
  | { ok: false; message: string };

export function validateSpouseForElectronicSignature(
  sale: Record<string, unknown> | null | undefined,
): SpouseSignatureValidationResult {
  const spouse = extractRecantoSpouseSource(sale);
  if (!spouse) {
    return { ok: false, message: SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE };
  }

  const name = String(spouse.name || '').trim();
  const cpf = onlyDigits(spouse.cpf);
  const phone = String(spouse.phone || '').trim();
  const emailRaw = String(spouse.email || '').trim();
  const email = emailRaw && isValidSignerEmail(emailRaw) ? emailRaw : '';

  if (!name || cpf.length !== 11) {
    return { ok: false, message: SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE };
  }

  const phoneDigits = onlyDigits(phone);
  const hasPhone = phoneDigits.length >= 10;
  const hasEmail = Boolean(email);

  if (!hasPhone && !hasEmail) {
    return { ok: false, message: SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE };
  }

  return {
    ok: true,
    name,
    cpf,
    phone: hasPhone ? phone : '',
    email,
  };
}

export function assertSpouseReadyForSignatureSend(params: {
  contractModel: unknown;
  sale: Record<string, unknown> | null | undefined;
  contractHtml?: string | null;
}): SpouseSignatureValidationResult | { ok: true; skipped: true } {
  if (
    !shouldCreateSpouseSignatureParty({
      contractModel: params.contractModel,
      sale: params.sale,
      contractHtml: params.contractHtml,
    })
  ) {
    return { ok: true, skipped: true };
  }

  return validateSpouseForElectronicSignature(params.sale);
}
