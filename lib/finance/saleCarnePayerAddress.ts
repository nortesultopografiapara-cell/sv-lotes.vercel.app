/**
 * Formatação conservadora do endereço do pagador no carnê (não persiste no banco).
 */

import { formatCep, onlyDigits } from '@/lib/inputMasks';

export type SaleCarnePayerAddressInput = {
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  stateUf?: string | null;
  cep?: string | null;
  zipCode?: string | null;
};

function cleanPart(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Heurística conservadora no logradouro livre:
 * - separa dígito colado em QUADRA/LOTE (RUA 02QUADRA → RUA 02, QUADRA)
 * - ", S" / " S" isolado no fim → S/N
 * Não altera nomes que contenham a letra S em outras posições.
 */
export function normalizeFreeformStreetForCarne(raw: string): string {
  let text = cleanPart(raw);
  if (!text) return '';

  // RUA 02QUADRA colado; também "123 LOTE" / "10 QUADRA" com espaço
  text = text.replace(/(\d)(QUADRA|LOTE)\b/gi, '$1, $2');
  text = text.replace(/(\d)\s+(QUADRA|LOTE)\b/gi, '$1, $2');

  // Final ", S" isolado → S/N (não altera nomes com S)
  text = text.replace(/,\s*S\s*$/i, ', S/N');

  text = text
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^,|,$/g, '')
    .trim();

  return text;
}

export function formatPayerAddressForCarne(
  input: SaleCarnePayerAddressInput,
): string {
  const street = normalizeFreeformStreetForCarne(input.address || '');
  const neighborhood = cleanPart(input.neighborhood);
  const city = cleanPart(input.city).toUpperCase();
  const uf = cleanPart(input.stateUf || input.state).toUpperCase();
  const cepDigits = onlyDigits(input.cep || input.zipCode);
  const cep =
    cepDigits.length === 8 ? formatCep(cepDigits) : cleanPart(input.cep || input.zipCode);

  const blocks: string[] = [];

  const line1Parts = [street, neighborhood].filter(Boolean);
  if (line1Parts.length) blocks.push(line1Parts.join(', '));

  if (city && uf) blocks.push(`${city}/${uf}`);
  else if (city) blocks.push(city);
  else if (uf) blocks.push(uf);

  if (cep) blocks.push(`CEP ${cep}`);

  return blocks.join(' — ');
}
