/**
 * Máscaras de entrada CPF/CNPJ e CEP (formulários cliente/venda).
 */

export function onlyDigits(value?: string | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatCpfCnpj(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (!digits) return '';

  if (digits.length <= 11) {
    const p1 = digits.slice(0, 3);
    const p2 = digits.slice(3, 6);
    const p3 = digits.slice(6, 9);
    const p4 = digits.slice(9, 11);
    if (digits.length <= 3) return p1;
    if (digits.length <= 6) return `${p1}.${p2}`;
    if (digits.length <= 9) return `${p1}.${p2}.${p3}`;
    return `${p1}.${p2}.${p3}-${p4}`;
  }

  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 8);
  const p4 = digits.slice(8, 12);
  const p5 = digits.slice(12, 14);
  if (digits.length <= 2) return p1;
  if (digits.length <= 5) return `${p1}.${p2}`;
  if (digits.length <= 8) return `${p1}.${p2}.${p3}`;
  if (digits.length <= 12) return `${p1}.${p2}.${p3}/${p4}`;
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
}

export function normalizeCpfCnpj(value?: string | null): string {
  return onlyDigits(value).slice(0, 14);
}

export function matchesCpfCnpj(
  search?: string | null,
  stored?: string | null,
): boolean {
  const s = normalizeCpfCnpj(search);
  const t = normalizeCpfCnpj(stored);
  if (!s || !t) return false;
  return t.includes(s) || s.includes(t);
}

export function formatCep(value?: string | null): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`;
}

export function normalizeCep(value?: string | null): string {
  return onlyDigits(value).slice(0, 8);
}

export function matchesCep(
  search?: string | null,
  stored?: string | null,
): boolean {
  const s = normalizeCep(search);
  const t = normalizeCep(stored);
  if (!s || !t) return false;
  return t.includes(s) || s.includes(t);
}

/** Padrões ilike para busca compatível com valor mascarado ou bruto no banco. */
export function cpfCnpjIlikePatterns(value?: string | null): string[] {
  const digits = normalizeCpfCnpj(value);
  if (!digits) return [];
  const out = new Set<string>([digits]);
  const full = formatCpfCnpj(digits);
  if (full) out.add(full);
  for (let n = 3; n <= digits.length; n++) {
    const partial = formatCpfCnpj(digits.slice(0, n));
    if (partial) out.add(partial);
  }
  return Array.from(out);
}

export function cepIlikePatterns(value?: string | null): string[] {
  const digits = normalizeCep(value);
  if (!digits) return [];
  const out = new Set<string>([digits]);
  const full = formatCep(digits);
  if (full) out.add(full);
  for (let n = 2; n <= digits.length; n++) {
    const partial = formatCep(digits.slice(0, n));
    if (partial) out.add(partial);
  }
  return Array.from(out);
}
