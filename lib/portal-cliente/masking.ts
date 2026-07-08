import { normalizePhoneDigits } from '@/lib/inputMasks';

/** Nome mascarado — ex.: JO*** SI*** */
export function maskCustomerName(name?: string | null): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '***';
  return parts
    .map((part) => {
      const prefix = part.slice(0, 2).toUpperCase();
      return prefix.length > 0 ? `${prefix}***` : '***';
    })
    .join(' ');
}

/** Telefone mascarado — ex.: (94) 99***-**18 */
export function maskPhone(phone?: string | null): string | null {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) return null;

  const ddd = digits.length >= 11 ? digits.slice(0, 2) : digits.slice(0, 2);
  const last2 = digits.slice(-2);

  if (digits.length >= 11) {
    const prefix = digits.slice(2, 4);
    return `(${ddd}) ${prefix}***-**${last2}`;
  }

  return `(${ddd}) ****-**${last2}`;
}

/** E-mail não é exposto na etapa de lookup — função reservada para validação interna. */
export function maskEmail(email?: string | null): string | null {
  const value = String(email ?? '').trim();
  if (!value || !value.includes('@')) return null;
  const [local, domain] = value.split('@');
  if (!local || !domain) return null;
  const localMasked = `${local.slice(0, 1)}***`;
  const domainParts = domain.split('.');
  const tld = domainParts.pop() ?? '';
  const domainMasked = domainParts.length > 0 ? '***' : '***';
  return `${localMasked}@${domainMasked}${tld ? `.${tld}` : ''}`;
}
