/**
 * Validação da geração inicial de contrato — evita versão ativa com R$ 0,00.
 */

export type ContractGenerationViability = {
  ok: boolean;
  reasons: string[];
  saleValue: number;
  hasLotLabel: boolean;
  hasBlockLabel: boolean;
};

export function assessGeneratedContractViability(params: {
  html: string;
  sale: Record<string, unknown>;
  block: Record<string, unknown>;
  receiptsSum?: number;
}): ContractGenerationViability {
  const reasons: string[] = [];
  const saleValue =
    Number(params.sale.total_value) ||
    Number(params.sale.agreed_price) ||
    Number(params.sale.sale_price) ||
    Number(params.receiptsSum) ||
    0;

  if (!(saleValue > 0)) {
    reasons.push('valor da venda ausente ou zero após persistência');
  }

  const quadra = String(
    params.block.block_name ||
      params.block.block ||
      params.block.quadra ||
      params.sale.block_number ||
      '',
  ).trim();
  const lote = String(
    params.block.number ??
      params.block.lot_number ??
      params.block.lot ??
      params.sale.lot_number ??
      '',
  ).trim();

  const hasBlockLabel = Boolean(quadra);
  const hasLotLabel = Boolean(lote);
  if (!hasBlockLabel) reasons.push('quadra/bloco ausente no lote persistido');
  if (!hasLotLabel) reasons.push('número do lote ausente no registro persistido');

  const html = String(params.html || '');
  const hasPositiveCurrency = /R\$\s*[1-9]/.test(html);
  // Entrada R$ 0,00 é legítima; só bloqueia se o HTML não tiver nenhum valor positivo.
  if (/R\$\s*0,00/.test(html) && saleValue > 0 && !hasPositiveCurrency) {
    reasons.push('HTML gerado contém R$ 0,00 apesar da venda ter valor');
  }
  if (!html.trim()) {
    reasons.push('HTML do contrato vazio');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    saleValue,
    hasLotLabel,
    hasBlockLabel,
  };
}

export function assertGeneratedContractViable(
  assessment: ContractGenerationViability,
): void {
  if (assessment.ok) return;
  throw new Error(
    `Contrato não gerado: dados incompletos (${assessment.reasons.join('; ')}).`,
  );
}
