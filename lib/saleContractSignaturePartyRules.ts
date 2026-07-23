/**
 * Regras de inclusão e validação do cônjuge como signatário eletrônico.
 * Fase atual: apenas RECANTO_PRIMAVERA (campo CÔNJUGE ANUENTE no PDF).
 *
 * Regra unificada (alinhada a recantoPrimaveraContractContext / saleSpouseFields):
 *   requiresSpouse =
 *     model === RECANTO_PRIMAVERA &&
 *     (hasRecantoSpouse(sale) || contractHtmlHasSpouseSlot(html))
 *
 * Não depende de has_spouse (UI). Não bloqueia por ausência do texto no HTML
 * quando a venda já tem sale_spouse_name / sale_spouse_cpf.
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

/** Alias estável — mesma regra do PDF Recanto (sale_spouse_name || sale_spouse_cpf). */
export function hasRecantoSpouse(
  sale: Record<string, unknown> | null | undefined,
): boolean {
  return hasSaleSpouseData(sale);
}

/**
 * Detecta o slot "CÔNJUGE ANUENTE" no HTML (NFC/NFD e entidades comuns).
 */
export function contractHtmlHasSpouseAnuenteSlot(
  contractHtml?: string | null,
): boolean {
  const raw = String(contractHtml || '');
  if (!raw.trim()) return false;

  const normalized = raw
    .normalize('NFKC')
    .replace(/&Ocirc;|&ocirc;|&#[Oo]circ;|&#212;|&#244;/g, 'Ô')
    .replace(/Ã[”"]/g, 'Ô')
    .toUpperCase();

  // Remove tags para cobrir "CÔNJUGE</p><p>ANUENTE" e variações com espaços.
  const plain = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return (
    plain.includes('CÔNJUGE ANUENTE') ||
    plain.includes('CONJUGE ANUENTE') ||
    /C[\u00D4O]NJUGE\s+ANUENTE/.test(plain)
  );
}

export function supportsSpouseElectronicSignature(
  contractModel: unknown,
): boolean {
  const model = normalizeSaleContractModel(contractModel);
  return SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes(model);
}

/**
 * Cônjuge é signatário eletrônico quando o modelo é Recanto e a venda
 * (ou o HTML) indica presença do cônjuge — mesma base do PDF.
 */
export function shouldCreateSpouseSignatureParty(params: {
  contractModel: unknown;
  sale: Record<string, unknown> | null | undefined;
  contractHtml?: string | null;
}): boolean {
  if (!supportsSpouseElectronicSignature(params.contractModel)) {
    return false;
  }

  const fromSale = hasRecantoSpouse(params.sale);
  const fromHtml = contractHtmlHasSpouseAnuenteSlot(params.contractHtml);

  // Venda com cônjuge → obrigatório (não depende do HTML persistido).
  // HTML com slot e venda sem campos → também exige (validação pedirá os dados).
  return fromSale || fromHtml;
}

/** Nome explícito pedido na homologação. */
export function requiresSpouseSignature(params: {
  contractModel: unknown;
  sale: Record<string, unknown> | null | undefined;
  contractHtml?: string | null;
}): boolean {
  return shouldCreateSpouseSignatureParty(params);
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
