import type { MasterTopographyClientInput } from './clientTypes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanRequired(value: unknown, field: string, max = 200): string {
  const s = cleanText(value, max);
  if (!s) throw new Error(`${field} é obrigatório.`);
  return s;
}

/** Remove máscara — apenas dígitos. */
export function normalizeDocumentDigits(value: unknown): string | null {
  const s = cleanText(value, 40);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits || null;
}

export function normalizePhoneDigits(value: unknown): string | null {
  const s = cleanText(value, 40);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits || null;
}

export function normalizeEmail(value: unknown): string | null {
  const s = cleanText(value, 200);
  if (!s) return null;
  return s.toLowerCase();
}

export function formatDocumentDisplay(digits: string | null, raw?: string | null): string | null {
  if (raw && String(raw).trim()) return String(raw).trim().slice(0, 40);
  if (!digits) return null;
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return digits;
}

/**
 * Valida cadastro de cliente Master Topografia.
 * CPF/CNPJ: 11 ou 14 dígitos quando informado.
 */
export function validateTopographyClientInput(
  raw: Record<string, unknown>,
): MasterTopographyClientInput & {
  document_normalized: string | null;
  phone_normalized: string | null;
  email_normalized: string | null;
} {
  const name = cleanRequired(raw.name, 'Nome do cliente', 200);
  const document_normalized = normalizeDocumentDigits(raw.document ?? raw.cpf_cnpj ?? raw.cpfCnpj);
  if (document_normalized && document_normalized.length !== 11 && document_normalized.length !== 14) {
    throw new Error('CPF/CNPJ inválido. Informe 11 (CPF) ou 14 (CNPJ) dígitos.');
  }

  const phone = cleanText(raw.phone ?? raw.telefone, 40);
  const phone_normalized = normalizePhoneDigits(phone);
  const emailRaw = cleanText(raw.email, 200);
  if (emailRaw && !EMAIL_RE.test(emailRaw)) throw new Error('E-mail inválido.');
  const email_normalized = normalizeEmail(emailRaw);

  return {
    name,
    document: formatDocumentDisplay(document_normalized, cleanText(raw.document, 40)),
    document_normalized,
    phone,
    phone_normalized,
    email: emailRaw,
    email_normalized,
    contact_name: cleanText(raw.contact_name ?? raw.contactName, 160),
    address: cleanText(raw.address, 500),
    city: cleanText(raw.city, 120),
    state: cleanText(raw.state, 2)?.toUpperCase() ?? null,
    notes: cleanText(raw.notes, 4000),
  };
}
