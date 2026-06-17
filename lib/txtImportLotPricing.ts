/**
 * Preço por m² na importação TXT Civil 3D → blocks.price
 */

export type ParsePricePerM2Result =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** Aceita "120,00", "120.00", "R$ 120,00". Vazio = opcional (null). */
export function parsePricePerM2Input(
  raw: string | number | null | undefined,
): ParsePricePerM2Result {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: 'Preço por m² inválido.' };
    }
    if (raw < 0) {
      return { ok: false, error: 'Preço por m² não pode ser negativo.' };
    }
    return { ok: true, value: raw === 0 ? null : raw };
  }

  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, value: null };

  let s = trimmed.replace(/[R$\s]/gi, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'Preço por m² inválido. Use formato como 120,00 ou 120.00.' };
  }
  if (n < 0) {
    return { ok: false, error: 'Preço por m² não pode ser negativo.' };
  }
  if (n === 0) {
    return { ok: false, error: 'Informe um preço por m² maior que zero ou deixe o campo vazio.' };
  }
  return { ok: true, value: n };
}

/** preço = área × preço/m², arredondado em 2 casas decimais. */
export function calculateLotPriceFromAreaM2(areaM2: number, pricePerM2: number): number {
  if (!Number.isFinite(areaM2) || !Number.isFinite(pricePerM2)) return 0;
  return Math.round(areaM2 * pricePerM2 * 100) / 100;
}

export function resolveImportedLotPrice(input: {
  areaM2: number;
  pricePerM2: number | null;
  existingPrice?: number | null;
  overwriteExistingPrices: boolean;
  hadExistingLot: boolean;
}): number | null {
  const { areaM2, pricePerM2, existingPrice, overwriteExistingPrices, hadExistingLot } =
    input;

  const existing =
    existingPrice != null && Number.isFinite(Number(existingPrice))
      ? Number(existingPrice)
      : null;

  if (pricePerM2 == null) {
    if (hadExistingLot && existing != null) return existing;
    return null;
  }

  if (hadExistingLot && !overwriteExistingPrices && existing != null) {
    return existing;
  }

  return calculateLotPriceFromAreaM2(areaM2, pricePerM2);
}

export function buildTxtImportAuditDescription(input: {
  quadraName: string;
  lotCount: number;
  pricePerM2: number | null;
  overwriteExistingPrices: boolean;
  isReimport: boolean;
  pricedFromM2Count: number;
  preservedPriceCount: number;
}): string {
  const parts = [
    `Importação TXT Civil 3D — quadra ${input.quadraName}`,
    `${input.lotCount} lote(s)`,
  ];
  if (input.pricePerM2 != null) {
    parts.push(`preço/m²: R$ ${input.pricePerM2.toFixed(2).replace('.', ',')}`);
    parts.push(`${input.pricedFromM2Count} lote(s) com valor calculado`);
  } else {
    parts.push('preço/m²: não informado');
  }
  if (input.isReimport) {
    parts.push(
      input.overwriteExistingPrices
        ? 'valores existentes: sobrescritos pelo preço/m²'
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
