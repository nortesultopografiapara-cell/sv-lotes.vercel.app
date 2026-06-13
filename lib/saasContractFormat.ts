/**
 * Máscaras de exibição do Contrato SaaS (página 1, cláusulas, assinatura).
 */

function onlyDigits(value?: string | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isDisplayPlaceholder(value: string): boolean {
  return !value || value === 'Não informado' || value === '—';
}

/** CNPJ: XXXXXXXXXXXXXX → XX.XXX.XXX/XXXX-XX */
export function formatContractCnpj(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (isDisplayPlaceholder(raw)) return raw;
  const digits = onlyDigits(raw).slice(0, 14);
  if (digits.length !== 14) return raw;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Telefone: XXXXXXXXXXX → (XX) XXXXX-XXXX */
export function formatContractPhone(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (isDisplayPlaceholder(raw)) return raw;
  const digits = onlyDigits(raw);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/** CEP: XXXXXXXX → XXXXX-XXX */
export function formatContractCep(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (isDisplayPlaceholder(raw)) return raw;
  const digits = onlyDigits(raw).slice(0, 8);
  if (digits.length !== 8) return raw;
  return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function titleCaseWord(word: string): string {
  const trimmed = word.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** Cidade: parauapebas/PA → Parauapebas/PA */
export function formatContractCity(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (isDisplayPlaceholder(raw)) return raw;
  if (raw === 'Não informado/Não informado') return raw;

  if (raw.includes('/')) {
    const slash = raw.indexOf('/');
    const city = raw.slice(0, slash);
    const uf = raw.slice(slash + 1).trim().toUpperCase();
    const cityFormatted = titleCaseWord(city);
    return uf ? `${cityFormatted}/${uf}` : cityFormatted;
  }

  return titleCaseWord(raw);
}
