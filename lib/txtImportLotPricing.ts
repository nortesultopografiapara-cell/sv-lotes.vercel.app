/**
 * Preço na importação TXT Civil 3D → blocks.price
 *
 * pricingMode AREA: lotPrice = área × preço/m² (regra existente).
 * pricingMode UNIT: lotPrice = preço fixo por unidade (independente da área).
 * O modo é só da operação de importação; persiste-se o valor final em blocks.price.
 */

export type TxtImportPricingMode = 'AREA' | 'UNIT';

export type ParsePricePerM2Result =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export type ParseUnitPriceResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export type TxtImportPricingInputResult =
  | {
      ok: true;
      pricingMode: TxtImportPricingMode;
      pricePerM2: number | null;
      unitPrice: number | null;
    }
  | { ok: false; error: string };

function parseBrazilianMoneyNumber(
  raw: string | number | null | undefined,
  fieldLabel: string,
): { ok: true; value: number } | { ok: false; error: string } | { ok: true; empty: true } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: `${fieldLabel} inválido.` };
    }
    if (raw < 0) {
      return { ok: false, error: `${fieldLabel} não pode ser negativo.` };
    }
    return { ok: true, value: raw };
  }

  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, empty: true };

  let s = trimmed.replace(/[R$\s]/gi, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      error: `${fieldLabel} inválido. Use formato como 120,00 ou 50.000,00.`,
    };
  }
  if (n < 0) {
    return { ok: false, error: `${fieldLabel} não pode ser negativo.` };
  }
  return { ok: true, value: n };
}

/** Aceita "120,00", "120.00", "R$ 120,00". Vazio = opcional (null). */
export function parsePricePerM2Input(
  raw: string | number | null | undefined,
): ParsePricePerM2Result {
  const parsed = parseBrazilianMoneyNumber(raw, 'Preço por m²');
  if (!parsed.ok) return parsed;
  if ('empty' in parsed) return { ok: true, value: null };
  if (parsed.value === 0) {
    if (typeof raw === 'number') return { ok: true, value: null };
    return {
      ok: false,
      error: 'Informe um preço por m² maior que zero ou deixe o campo vazio.',
    };
  }
  return { ok: true, value: parsed.value };
}

/** Aceita formato BR. Vazio e zero são inválidos — exigido na modalidade Por unidade. */
export function parseUnitPriceInput(
  raw: string | number | null | undefined,
): ParseUnitPriceResult {
  const parsed = parseBrazilianMoneyNumber(raw, 'Preço por unidade / lote');
  if (!parsed.ok) return parsed;
  if ('empty' in parsed) {
    return {
      ok: false,
      error: 'Informe o preço por unidade / lote (valor maior que zero).',
    };
  }
  if (parsed.value === 0) {
    return {
      ok: false,
      error: 'Informe um preço por unidade / lote maior que zero.',
    };
  }
  return { ok: true, value: parsed.value };
}

/** Valida a operação de importação: AREA (opcional) ou UNIT (obrigatório > 0). */
export function resolveTxtImportPricingInput(
  mode: TxtImportPricingMode | null | undefined,
  pricePerM2Raw: string | number | null | undefined,
  unitPriceRaw: string | number | null | undefined,
): TxtImportPricingInputResult {
  const pricingMode: TxtImportPricingMode = mode === 'UNIT' ? 'UNIT' : 'AREA';
  if (pricingMode === 'UNIT') {
    const unitParse = parseUnitPriceInput(unitPriceRaw);
    if (!unitParse.ok) return unitParse;
    return {
      ok: true,
      pricingMode,
      pricePerM2: null,
      unitPrice: unitParse.value,
    };
  }
  const m2Parse = parsePricePerM2Input(pricePerM2Raw);
  if (!m2Parse.ok) return m2Parse;
  return {
    ok: true,
    pricingMode,
    pricePerM2: m2Parse.value,
    unitPrice: null,
  };
}

/** preço = área × preço/m², arredondado em 2 casas decimais. */
export function calculateLotPriceFromAreaM2(areaM2: number, pricePerM2: number): number {
  if (!Number.isFinite(areaM2) || !Number.isFinite(pricePerM2)) return 0;
  return Math.round(areaM2 * pricePerM2 * 100) / 100;
}

/** preço fixo por unidade, arredondado em 2 casas (não deriva da área). */
export function calculateLotPriceFromUnit(unitPrice: number): number {
  if (!Number.isFinite(unitPrice)) return 0;
  return Math.round(unitPrice * 100) / 100;
}

export function resolveImportedLotPrice(input: {
  areaM2: number;
  pricePerM2?: number | null;
  unitPrice?: number | null;
  pricingMode?: TxtImportPricingMode | null;
  existingPrice?: number | null;
  overwriteExistingPrices: boolean;
  hadExistingLot: boolean;
}): number | null {
  const {
    areaM2,
    pricePerM2 = null,
    unitPrice = null,
    existingPrice,
    overwriteExistingPrices,
    hadExistingLot,
  } = input;
  const pricingMode: TxtImportPricingMode =
    input.pricingMode === 'UNIT' ? 'UNIT' : 'AREA';

  const existing =
    existingPrice != null && Number.isFinite(Number(existingPrice))
      ? Number(existingPrice)
      : null;

  const offeredPrice =
    pricingMode === 'UNIT'
      ? unitPrice != null && Number.isFinite(unitPrice) && unitPrice > 0
        ? calculateLotPriceFromUnit(unitPrice)
        : null
      : pricePerM2 != null
        ? calculateLotPriceFromAreaM2(areaM2, pricePerM2)
        : null;

  if (offeredPrice == null) {
    if (hadExistingLot && existing != null) return existing;
    return null;
  }

  if (hadExistingLot && !overwriteExistingPrices && existing != null) {
    return existing;
  }

  return offeredPrice;
}

export function buildTxtImportAuditDescription(input: {
  quadraName: string;
  lotCount: number;
  pricePerM2?: number | null;
  unitPrice?: number | null;
  pricingMode?: TxtImportPricingMode | null;
  overwriteExistingPrices: boolean;
  isReimport: boolean;
  pricedFromM2Count: number;
  pricedFromUnitCount?: number;
  preservedPriceCount: number;
}): string {
  const pricingMode: TxtImportPricingMode =
    input.pricingMode === 'UNIT' ? 'UNIT' : 'AREA';
  const parts = [
    `Importação TXT Civil 3D — quadra ${input.quadraName}`,
    `${input.lotCount} lote(s)`,
  ];
  if (pricingMode === 'UNIT') {
    if (input.unitPrice != null) {
      parts.push(
        `preço por unidade: R$ ${input.unitPrice.toFixed(2).replace('.', ',')}`,
      );
      parts.push(
        `${input.pricedFromUnitCount ?? 0} lote(s) com valor fixo por unidade`,
      );
    } else {
      parts.push('preço por unidade: não informado');
    }
  } else if (input.pricePerM2 != null) {
    parts.push(`preço/m²: R$ ${input.pricePerM2.toFixed(2).replace('.', ',')}`);
    parts.push(`${input.pricedFromM2Count} lote(s) com valor calculado`);
  } else {
    parts.push('preço/m²: não informado');
  }
  if (input.isReimport) {
    const overwriteLabel =
      pricingMode === 'UNIT'
        ? 'valores existentes: sobrescritos pelo preço por unidade'
        : 'valores existentes: sobrescritos pelo preço/m²';
    parts.push(
      input.overwriteExistingPrices
        ? overwriteLabel
        : 'valores existentes: preservados',
    );
    if (input.preservedPriceCount > 0) {
      parts.push(`${input.preservedPriceCount} preço(s) preservado(s)`);
    }
  }
  return parts.join(' · ');
}

export function lotNumberKey(raw: string | number | null | undefined): string {
  return String(raw ?? '').trim();
}
