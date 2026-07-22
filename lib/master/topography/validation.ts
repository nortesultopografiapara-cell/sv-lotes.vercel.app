import { isTopographyCategory } from './categories';
import {
  isTopographyFinancialSituation,
  isTopographyOrigin,
} from './origins';
import { isTopographyPriority } from './priorities';
import { isTopographyServiceType } from './serviceTypes';
import { isTopographyStatus } from './statuses';
import type { MasterTopographyProjectInput } from './types';

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

function parsePercent(value: unknown, field: string, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error(`${field} deve ser um inteiro entre 0 e 100.`);
  }
  return n;
}

function parseOptionalMoney(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Valor contratado não pode ser negativo.');
  }
  return Math.round(n * 100) / 100;
}

function parseOptionalNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  return n;
}

/**
 * Valida e normaliza payload de criação/edição.
 * Obrigatórios: title, client_name, category, service_type, status.
 */
export function validateTopographyProjectInput(
  raw: Record<string, unknown>,
): MasterTopographyProjectInput {
  const title = cleanRequired(raw.title, 'Projeto', 200);
  const client_name = cleanRequired(raw.client_name ?? raw.clientName, 'Cliente', 200);

  const categoryRaw = String(raw.category || '').trim();
  if (!isTopographyCategory(categoryRaw)) throw new Error('Categoria inválida.');

  const serviceRaw = String(raw.service_type ?? raw.serviceType ?? '').trim();
  if (!isTopographyServiceType(serviceRaw)) throw new Error('Tipo de serviço inválido.');

  const statusRaw = String(raw.status || '').trim();
  if (!isTopographyStatus(statusRaw)) throw new Error('Status inválido.');

  const priorityRaw = String(raw.priority || 'NORMAL').trim();
  if (!isTopographyPriority(priorityRaw)) throw new Error('Prioridade inválida.');

  const financialRaw = String(
    raw.financial_situation ?? raw.financialSituation ?? 'NAO_FATURADO',
  ).trim();
  if (!isTopographyFinancialSituation(financialRaw)) {
    throw new Error('Situação financeira inválida.');
  }

  const originRaw = cleanText(raw.origin, 40);
  if (originRaw && !isTopographyOrigin(originRaw)) throw new Error('Origem inválida.');

  const state = cleanText(raw.state, 2)?.toUpperCase() ?? null;
  if (state && !UF_RE.test(state)) throw new Error('UF inválida.');

  const email = cleanText(raw.client_email ?? raw.clientEmail, 160);
  if (email && !EMAIL_RE.test(email)) throw new Error('E-mail do cliente inválido.');

  return {
    title,
    client_name,
    client_contact_name: cleanText(raw.client_contact_name ?? raw.clientContactName, 160),
    client_phone: cleanText(raw.client_phone ?? raw.clientPhone, 40),
    client_email: email,
    category: categoryRaw,
    service_type: serviceRaw,
    origin: (originRaw as MasterTopographyProjectInput['origin']) ?? null,
    description: cleanText(raw.description, 4000),
    status: statusRaw,
    priority: priorityRaw,
    financial_situation: financialRaw,
    city: cleanText(raw.city, 120),
    state,
    address: cleanText(raw.address, 400),
    latitude: parseOptionalNumber(raw.latitude, 'Latitude'),
    longitude: parseOptionalNumber(raw.longitude, 'Longitude'),
    distance_from_parauapebas_km: parseOptionalNumber(
      raw.distance_from_parauapebas_km ?? raw.distanceFromParauapebasKm,
      'Distância',
    ),
    contract_date: parseOptionalDate(raw.contract_date ?? raw.contractDate, 'Data de contratação'),
    planned_start_date: parseOptionalDate(
      raw.planned_start_date ?? raw.plannedStartDate,
      'Data prevista de início',
    ),
    planned_end_date: parseOptionalDate(
      raw.planned_end_date ?? raw.plannedEndDate,
      'Prazo previsto',
    ),
    actual_end_date: parseOptionalDate(
      raw.actual_end_date ?? raw.actualEndDate,
      'Data de conclusão',
    ),
    contract_value: parseOptionalMoney(raw.contract_value ?? raw.contractValue),
    payment_terms: cleanText(raw.payment_terms ?? raw.paymentTerms, 500),
    origin_budget_number: cleanText(
      raw.origin_budget_number ?? raw.originBudgetNumber,
      80,
    ),
    internal_manager: cleanText(raw.internal_manager ?? raw.internalManager, 160),
    technical_manager: cleanText(raw.technical_manager ?? raw.technicalManager, 160),
    team_notes: cleanText(raw.team_notes ?? raw.teamNotes, 2000),
    progress_percent: parsePercent(raw.progress_percent ?? raw.progressPercent, 'Progresso', 0),
    physical_progress_percent: parsePercent(
      raw.physical_progress_percent ?? raw.physicalProgressPercent,
      'Progresso físico',
      0,
    ),
    current_stage: cleanText(raw.current_stage ?? raw.currentStage, 200),
    technical_notes: cleanText(raw.technical_notes ?? raw.technicalNotes, 4000),
    pending_items: cleanText(raw.pending_items ?? raw.pendingItems, 4000),
    next_action: cleanText(raw.next_action ?? raw.nextAction, 500),
    next_action_date: parseOptionalDate(
      raw.next_action_date ?? raw.nextActionDate,
      'Data da próxima ação',
    ),
  };
}
