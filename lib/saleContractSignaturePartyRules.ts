/**
 * Regras de inclusão e validação do cônjuge como signatário eletrônico.
 * Global: todos os modelos de contrato de venda.
 *
 * has_spouse === false → nunca exige cônjuge (ignora HTML e campos residuais).
 * has_spouse === true  → sempre exige e valida nome + CPF + contato.
 * has_spouse ausente   → legado: nome+CPF da venda OU tag real no HTML
 *                        (nunca texto/seletor dentro de <style>).
 *
 * Não depende do estado civil do comprador.
 */

import { isValidSignerEmail } from '@/lib/saleContractEmailValidation';
import {
  normalizeSaleContractModel,
  SALE_CONTRACT_MODELS,
  type SaleContractModel,
} from '@/lib/contractModel';
import { onlyDigits } from '@/lib/inputMasks';
import {
  extractRecantoSpouseSource,
  hasSaleSpouseData,
  parseSaleHasSpouseFlag,
  resolveSaleSpouseContext,
} from '@/lib/saleSpouseFields';
import {
  contractHtmlHasSpousePartyRoleAttr,
  stripEmbeddedStyleAndScript,
} from '@/lib/saleSpouseContractHtml';

/** Todos os modelos suportam party SPOUSE quando a venda tem cônjuge válido. */
export const SPOUSE_ELECTRONIC_SIGNATURE_MODELS: SaleContractModel[] = [
  ...SALE_CONTRACT_MODELS,
];

export const SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE =
  'O contrato possui cônjuge anuente, mas os dados necessários para a assinatura estão incompletos. Informe o nome, o CPF e pelo menos um telefone ou e-mail do cônjuge.';

/** Alias — resolveSaleSpouseContext.hasSpouse. */
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
  if (contractHtmlHasSpousePartyRoleAttr(contractHtml)) return true;

  const raw = stripEmbeddedStyleAndScript(String(contractHtml || ''));
  if (!raw.trim()) return false;

  const normalized = raw
    .normalize('NFKC')
    .replace(/&Ocirc;|&ocirc;|&#[Oo]circ;|&#212;|&#244;/g, 'Ô')
    .replace(/Ã[”"]/g, 'Ô')
    .toUpperCase();

  const plain = normalized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return (
    plain.includes('CÔNJUGE ANUENTE') ||
    plain.includes('CONJUGE ANUENTE') ||
    /C[\u00D4O]NJUGE\s+ANUENTE/.test(plain)
  );
}

/**
 * Detecta HTML gerado pelo template Recanto (classe ou slot de assinatura).
 */
export function contractHtmlLooksLikeRecanto(
  contractHtml?: string | null,
): boolean {
  const raw = String(contractHtml || '');
  if (!raw.trim()) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('sv-contract-recanto-primavera') ||
    contractHtmlHasSpouseAnuenteSlot(raw) ||
    /cl[aá]usula primeira[\s\S]{0,80}declara/i.test(raw)
  );
}

export function supportsSpouseElectronicSignature(
  contractModel: unknown,
): boolean {
  const model = normalizeSaleContractModel(contractModel);
  return SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes(model);
}

/**
 * Cônjuge é signatário eletrônico quando a venda (ou o HTML) indica presença.
 * Independente do modelo (Meneses, Recanto, SV2, Padrão).
 */
export function shouldCreateSpouseSignatureParty(params: {
  contractModel: unknown;
  sale: Record<string, unknown> | null | undefined;
  contractHtml?: string | null;
}): boolean {
  if (!supportsSpouseElectronicSignature(params.contractModel)) {
    // CUSTOM futuro ainda está na lista; se modelo desconhecido, normaliza para PADRAO.
    const model = normalizeSaleContractModel(params.contractModel);
    if (!SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes(model)) return false;
  }

  const flag = parseSaleHasSpouseFlag(params.sale?.has_spouse);
  if (flag === false) return false;
  if (flag === true) return true;

  const fromSale = resolveSaleSpouseContext(params.sale).hasSpouse;
  const fromHtml = contractHtmlHasSpouseAnuenteSlot(params.contractHtml);
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
