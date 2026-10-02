/**
 * Emissão FINAL do modelo CUSTOM LF ESTRELA.
 * Modo diagnóstico (editor sem venda) continua com [SEM DADO].
 * Modo final/PDF: valida obrigatórios, oculta opcionais e nunca imprime [SEM DADO].
 * Não usa generateEstrelaDoSulContract.
 */
import {
  fillCustomPlaceholders,
  type CustomPlaceholderFillMode,
} from '@/lib/customContractHtml';
import { onlyDigits } from '@/lib/inputMasks';
import { resolveSaleSpouseContext } from '@/lib/saleSpouseFields';

export const LF_ESTRELA_MISSING_HEADER =
  'Não foi possível gerar o LF ESTRELA.\nComplete os seguintes dados:';

export const LF_ESTRELA_REQUIRED_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'CLIENT_NAME', label: 'Nome do comprador' },
  { key: 'CLIENT_CPF', label: 'CPF/CNPJ do comprador' },
  { key: 'CLIENT_RG', label: 'RG do comprador' },
  { key: 'CLIENT_NATIONALITY', label: 'Nacionalidade do comprador' },
  { key: 'CLIENT_CIVIL_STATE', label: 'Estado civil do comprador' },
  { key: 'CLIENT_PROFESSION', label: 'Profissão do comprador' },
  { key: 'CLIENT_ADDRESS', label: 'Endereço do comprador' },
  { key: 'COMPANY_LEGAL_NAME', label: 'Razão social da empresa' },
  { key: 'COMPANY_CNPJ', label: 'CNPJ da empresa' },
  { key: 'SELLER_2_NAME', label: 'Nome do vendedor 2' },
  { key: 'SELLER_2_CPF_CNPJ', label: 'CPF/CNPJ do vendedor 2' },
  { key: 'SELLER_2_NATIONALITY', label: 'Nacionalidade do vendedor 2' },
  { key: 'SELLER_2_CIVIL_STATE', label: 'Estado civil do vendedor 2' },
  { key: 'SELLER_2_PROFESSION', label: 'Profissão do vendedor 2' },
  { key: 'SELLER_2_RG', label: 'RG do vendedor 2' },
  { key: 'SELLER_2_ADDRESS', label: 'Endereço do vendedor 2' },
  { key: 'PROJECT_NAME', label: 'Empreendimento' },
  { key: 'BLOCK_NAME', label: 'Quadra' },
  { key: 'LOT_NUMBER', label: 'Lote' },
  { key: 'LOT_AREA', label: 'Área do lote' },
  { key: 'SALE_VALUE', label: 'Valor da venda' },
  { key: 'PAYMENT_TYPE', label: 'Forma de pagamento' },
  { key: 'CONTRACT_DATE_EXTENSO', label: 'Data do contrato' },
];

export const LF_ESTRELA_OPTIONAL_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'SPOUSE_NAME', label: 'Nome do cônjuge' },
  { key: 'SPOUSE_CPF', label: 'CPF do cônjuge' },
  { key: 'COMPANY_CRECI', label: 'CRECI da empresa' },
  { key: 'WITNESS_1_NAME', label: 'Testemunha 1' },
  { key: 'WITNESS_1_CPF', label: 'CPF da testemunha 1' },
  { key: 'WITNESS_2_NAME', label: 'Testemunha 2' },
  { key: 'WITNESS_2_CPF', label: 'CPF da testemunha 2' },
  { key: 'CLIENT_RG_ISSUER', label: 'Órgão emissor do RG do comprador' },
  { key: 'SELLER_2_RG_ISSUER', label: 'Órgão emissor do RG do vendedor 2' },
  { key: 'SELLER_2_EMAIL', label: 'E-mail do vendedor 2' },
];

export type LfEstrelaConditionFlags = {
  spouse: boolean;
  companyCreci: boolean;
};

function filled(values: Record<string, string | null>, key: string): boolean {
  return Boolean(String(values[key] || '').trim());
}

export function lfEstrelaHasSpouseFromValues(values: Record<string, string | null>): boolean {
  const name = String(values.SPOUSE_NAME || '').trim();
  const cpf = onlyDigits(values.SPOUSE_CPF || '');
  return Boolean(name) && cpf.length === 11;
}

export function lfEstrelaHasSpouseFromSale(sale: Record<string, unknown> | null | undefined): boolean {
  return resolveSaleSpouseContext(sale || {}).hasSpouse;
}

export function resolveLfEstrelaConditionFlags(
  values: Record<string, string | null>,
  sale?: Record<string, unknown> | null,
): LfEstrelaConditionFlags {
  return {
    spouse: sale ? lfEstrelaHasSpouseFromSale(sale) : lfEstrelaHasSpouseFromValues(values),
    companyCreci: filled(values, 'COMPANY_CRECI'),
  };
}

export function applyLfEstrelaConditionals(
  html: string,
  flags: LfEstrelaConditionFlags,
): string {
  let out = String(html || '');
  out = out.replace(
    /<([a-z0-9]+)([^>]*\bdata-sv-if=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, _tag: string, _attrs: string, flag: string) => {
      const key = String(flag || '').trim();
      if (key === 'spouse') return flags.spouse ? full : '';
      if (key === 'companyCreci') return flags.companyCreci ? full : '';
      return full;
    },
  );
  return out;
}

export function listLfEstrelaMissingRequired(
  values: Record<string, string | null>,
  flags: LfEstrelaConditionFlags,
): string[] {
  const missing: string[] = [];
  for (const field of LF_ESTRELA_REQUIRED_FIELDS) {
    if (field.key.startsWith('SELLER_2_') && !filled(values, 'SELLER_2_NAME') && !filled(values, 'SELLER_2_CPF_CNPJ')) {
      if (field.key === 'SELLER_2_NAME') missing.push(field.label);
      continue;
    }
    if (!filled(values, field.key)) missing.push(field.label);
  }
  if (flags.spouse) {
    if (!filled(values, 'SPOUSE_NAME')) missing.push('Nome do cônjuge');
    if (!filled(values, 'SPOUSE_CPF')) missing.push('CPF do cônjuge');
  }
  return missing;
}

export function formatLfEstrelaMissingMessage(missing: string[]): string {
  if (!missing.length) return '';
  return `${LF_ESTRELA_MISSING_HEADER}\n${missing.map((item) => `• ${item}`).join('\n')}`;
}

export function composeLfEstrelaContractHtml(
  templateHtml: string,
  values: Record<string, string | null>,
  options: {
    mode: CustomPlaceholderFillMode;
    sale?: Record<string, unknown> | null;
    requireComplete?: boolean;
  },
): { html: string; flags: LfEstrelaConditionFlags; missing: string[] } {
  const flags = resolveLfEstrelaConditionFlags(values, options.sale);
  const missing = listLfEstrelaMissingRequired(values, flags);
  if (options.requireComplete && missing.length && options.mode === 'final') {
    throw new Error(formatLfEstrelaMissingMessage(missing));
  }
  const conditioned = applyLfEstrelaConditionals(templateHtml, flags);
  const html = fillCustomPlaceholders(conditioned, values, options.mode);
  return { html, flags, missing };
}

export function assertNoSemDadoInFinalHtml(html: string): void {
  if (/\[SEM DADO:/i.test(html)) {
    throw new Error('O PDF final do LF ESTRELA não pode conter [SEM DADO].');
  }
}
