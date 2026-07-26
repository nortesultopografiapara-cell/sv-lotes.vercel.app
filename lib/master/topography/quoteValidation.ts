import { isTopographyCategory } from './categories';
import { isTopographyQuoteStatus } from './quoteStatuses';
import { isTopographyServiceType } from './serviceTypes';
import { isTopographyPriceBank } from './priceBanks';
import {
  parseQuoteScopeSelectedList,
  QUOTE_SCOPE_MAX_DELIVERABLES,
  QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES,
} from './quoteScopeCatalog';
import type {
  MasterTopographyQuoteInput,
  MasterTopographyQuoteItemInput,
  MasterTopographyQuoteStageInput,
} from './quoteTypes';

const UF_RE = /^[A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function parsePercent(value: unknown, field: string, max = 1000): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} não pode ser negativo.`);
  if (n > max) throw new Error(`${field} inválido.`);
  return Math.round(n * 10000) / 10000;
}

function parseOptionalNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  return n;
}

function parseQty(value: unknown, field: string): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} não pode ser negativo.`);
  return Math.round(n * 10000) / 10000;
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

  const bdi_percent = parsePercent(raw.bdi_percent ?? raw.bdiPercent, 'BDI', 1000);
  const discount_percent = parsePercent(
    raw.discount_percent ?? raw.discountPercent,
    'Percentual de desconto',
    100,
  );
  const margin_percent = parsePercent(
    raw.margin_percent ?? raw.marginPercent,
    'Margem',
    1000,
  );

  let final_value = parseOptionalMoney(raw.final_value ?? raw.finalValue, 'Valor final');
  if (final_value == null && estimated_value != null) {
    final_value = Math.round((estimated_value - discount_value) * 100) / 100;
  }

  return {
    client_name,
    title: cleanText(raw.title, 240),
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
    mobilization_deadline_text: cleanText(
      raw.mobilization_deadline_text ?? raw.mobilizationDeadlineText,
      200,
    ),
    field_duration_text: cleanText(raw.field_duration_text ?? raw.fieldDurationText, 200),
    processing_deadline_text: cleanText(
      raw.processing_deadline_text ?? raw.processingDeadlineText,
      200,
    ),
    delivery_deadline_text: cleanText(
      raw.delivery_deadline_text ?? raw.deliveryDeadlineText,
      200,
    ),
    total_deadline_text: cleanText(raw.total_deadline_text ?? raw.totalDeadlineText, 200),
    methodology_notes: cleanText(raw.methodology_notes ?? raw.methodologyNotes, 8000),
    professional_name: cleanText(raw.professional_name ?? raw.professionalName, 160),
    professional_title: cleanText(raw.professional_title ?? raw.professionalTitle, 160),
    professional_council: cleanText(raw.professional_council ?? raw.professionalCouncil, 80),
    professional_registration: cleanText(
      raw.professional_registration ?? raw.professionalRegistration,
      80,
    ),
    professional_registration_uf: cleanText(
      raw.professional_registration_uf ?? raw.professionalRegistrationUf,
      2,
    )?.toUpperCase() ?? null,
    estimated_value,
    discount_value,
    discount_percent,
    bdi_percent,
    margin_percent,
    final_value,
    payment_method: cleanText(raw.payment_method ?? raw.paymentMethod, 500),
    payment_terms: cleanText(raw.payment_terms ?? raw.paymentTerms, 500),
    internal_manager: cleanText(raw.internal_manager ?? raw.internalManager, 160),
    internal_notes: cleanText(raw.internal_notes ?? raw.internalNotes, 4000),
    technical_notes: cleanText(raw.technical_notes ?? raw.technicalNotes, 4000),
    technical_resources: parseQuoteScopeSelectedList(
      raw.technical_resources ?? raw.technicalResources ?? [],
      {
        maxItems: QUOTE_SCOPE_MAX_TECHNICAL_RESOURCES,
        fieldLabel: 'Equipamentos e recursos técnicos',
      },
    ),
    deliverables: parseQuoteScopeSelectedList(
      raw.deliverables ?? [],
      {
        maxItems: QUOTE_SCOPE_MAX_DELIVERABLES,
        fieldLabel: 'Produtos e dados entregues',
      },
    ),
  };
}

export function validateQuoteItemInput(raw: Record<string, unknown>): MasterTopographyQuoteItemInput {
  const idRaw = cleanText(raw.id, 36);
  if (idRaw && !UUID_RE.test(idRaw)) throw new Error('Item com id inválido.');

  const bankRaw = cleanText(raw.price_bank ?? raw.priceBank, 40);
  if (bankRaw && !isTopographyPriceBank(bankRaw)) throw new Error('Banco de preços inválido.');

  const adopted = parseMoneyDefault(
    raw.adopted_price ?? raw.adoptedPrice ?? raw.unit_value ?? raw.unitValue,
    'Preço adotado',
    0,
  );
  const reference = parseMoneyDefault(
    raw.reference_price ?? raw.referencePrice ?? adopted,
    'Preço referência',
    adopted,
  );

  const catalogId = cleanText(raw.catalog_item_id ?? raw.catalogItemId, 36);
  const customId = cleanText(raw.custom_item_id ?? raw.customItemId, 36);
  if (catalogId && !UUID_RE.test(catalogId)) throw new Error('Catálogo inválido.');
  if (customId && !UUID_RE.test(customId)) throw new Error('Item próprio inválido.');

  return {
    id: idRaw || undefined,
    code: cleanText(raw.code, 80),
    price_bank: bankRaw || null,
    description: cleanText(raw.description, 2000) || '',
    unit: cleanText(raw.unit, 20) || 'UN',
    quantity: parseQty(raw.quantity, 'Quantidade'),
    unit_value: adopted,
    reference_price: reference,
    adopted_price: adopted,
    competence: cleanText(raw.competence, 40),
    uf: cleanText(raw.uf, 2)?.toUpperCase() ?? null,
    notes: cleanText(raw.notes ?? raw.observations, 2000),
    calculation_notes: cleanText(
      raw.calculation_notes ?? raw.calculationNotes ?? raw.item_calculation_notes,
      2000,
    ),
    catalog_item_id: catalogId || null,
    custom_item_id: customId || null,
    sort_order: Math.max(0, Math.trunc(Number(raw.sort_order ?? raw.sortOrder ?? 0) || 0)),
  };
}

export function validateQuoteStageInput(raw: Record<string, unknown>): MasterTopographyQuoteStageInput {
  const idRaw = cleanText(raw.id, 36);
  if (idRaw && !UUID_RE.test(idRaw)) throw new Error('Etapa com id inválido.');

  const name = cleanRequired(raw.name, 'Nome da etapa', 160);
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw.map((item, idx) => {
    if (!item || typeof item !== 'object') throw new Error(`Item ${idx + 1} inválido.`);
    return validateQuoteItemInput(item as Record<string, unknown>);
  });

  return {
    id: idRaw || undefined,
    name,
    sort_order: Math.max(0, Math.trunc(Number(raw.sort_order ?? raw.sortOrder ?? 0) || 0)),
    is_system: Boolean(raw.is_system ?? raw.isSystem),
    items,
  };
}

export function validateQuoteStructurePayload(raw: Record<string, unknown>): {
  quote: MasterTopographyQuoteInput;
  stages: MasterTopographyQuoteStageInput[];
} {
  const quoteRaw =
    raw.quote && typeof raw.quote === 'object'
      ? (raw.quote as Record<string, unknown>)
      : raw;
  const quote = validateTopographyQuoteInput(quoteRaw);
  const stagesRaw = Array.isArray(raw.stages) ? raw.stages : [];
  const stages = stagesRaw.map((stage, idx) => {
    if (!stage || typeof stage !== 'object') throw new Error(`Etapa ${idx + 1} inválida.`);
    return validateQuoteStageInput(stage as Record<string, unknown>);
  });
  return { quote, stages };
}
