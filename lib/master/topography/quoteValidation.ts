import { isTopographyCategory } from './categories';
import { isTopographyQuoteStatus } from './quoteStatuses';
import { isTopographyServiceType } from './serviceTypes';
import type { MasterTopographyQuoteInput } from './quoteTypes';

const UF_RE = /^[A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function parseOptionalDate(value: unknown, field: string): string | null {
  const s = cleanText(value, 32);
  if (!s) return null;
  if (!DATE_RE.test(s)) throw new Error(`${field} inválida.`);
  return s;
}

function parseOptionalMoney(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} não pode ser negativo.`);
  return Math.round(n * 100) / 100;
}

function parseMoneyDefault(value: unknown, field: string, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} não pode ser negativo.`);
  return Math.round(n * 100) / 100;
}

function parseOptionalNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  return n;
}

/**
 * Valida payload de orçamento.
 * Obrigatórios: client_name, category, service_type, status.
 */
export function validateTopographyQuoteInput(
  raw: Record<string, unknown>,
): MasterTopographyQuoteInput {
  const client_name = cleanRequired(raw.client_name ?? raw.clientName, 'Cliente', 200);

  const categoryRaw = String(raw.category || '').trim();
  if (!isTopographyCategory(categoryRaw)) throw new Error('Categoria inválida.');

  const serviceRaw = String(raw.service_type ?? raw.serviceType ?? '').trim();
  if (!isTopographyServiceType(serviceRaw)) throw new Error('Tipo de serviço inválido.');

  const statusRaw = String(raw.status || 'RASCUNHO').trim();
  if (!isTopographyQuoteStatus(statusRaw)) throw new Error('Status inválido.');
  if (statusRaw === 'CONVERTIDO') {
    throw new Error('Status Convertido só pode ser definido pela conversão.');
  }

  const state = cleanText(raw.state, 2)?.toUpperCase() ?? null;
  if (state && !UF_RE.test(state)) throw new Error('UF inválida.');

  const email = cleanText(raw.email, 160);
  if (email && !EMAIL_RE.test(email)) throw new Error('E-mail inválido.');

  const estimated_value = parseOptionalMoney(
    raw.estimated_value ?? raw.estimatedValue,
    'Valor estimado',
  );
  const discount_value = parseMoneyDefault(
    raw.discount_value ?? raw.discountValue,
    'Desconto',
    0,
  );
  if (estimated_value != null && discount_value > estimated_value) {
    throw new Error('Desconto não pode ser maior que o valor estimado.');
  }

  let final_value = parseOptionalMoney(raw.final_value ?? raw.finalValue, 'Valor final');
  if (final_value == null && estimated_value != null) {
    final_value = Math.round((estimated_value - discount_value) * 100) / 100;
  }

  return {
    client_name,
    contact_name: cleanText(raw.contact_name ?? raw.contactName, 160),
    phone: cleanText(raw.phone, 40),
    email,
    city: cleanText(raw.city, 120),
    state,
    address: cleanText(raw.address, 400),
    distance_km: parseOptionalNumber(raw.distance_km ?? raw.distanceKm, 'Distância'),
    category: categoryRaw,
    service_type: serviceRaw,
    description: cleanText(raw.description, 4000),
    status: statusRaw,
    proposal_date: parseOptionalDate(raw.proposal_date ?? raw.proposalDate, 'Data da proposta'),
    expiration_date: parseOptionalDate(
      raw.expiration_date ?? raw.expirationDate,
      'Validade da proposta',
    ),
    estimated_deadline: cleanText(
      raw.estimated_deadline ?? raw.estimatedDeadline,
      200,
    ),
    estimated_value,
    discount_value,
    final_value,
    payment_method: cleanText(raw.payment_method ?? raw.paymentMethod, 120),
    payment_terms: cleanText(raw.payment_terms ?? raw.paymentTerms, 500),
    internal_manager: cleanText(raw.internal_manager ?? raw.internalManager, 160),
    internal_notes: cleanText(raw.internal_notes ?? raw.internalNotes, 4000),
    technical_notes: cleanText(raw.technical_notes ?? raw.technicalNotes, 4000),
  };
}
