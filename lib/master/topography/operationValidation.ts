import {
  canTransitionOperationStatus,
  isOperationPriority,
  isOperationStatus,
  type OperationStatusCode,
} from './operationStatuses';
import type { MasterTopographyOperationInput } from './operationTypes';

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

function parseOptionalUuid(value: unknown, field: string): string | null {
  const s = cleanText(value, 64);
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new Error(`${field} inválido.`);
  return s;
}

function parseOptionalMoney(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} não pode ser negativo.`);
  }
  return Math.round(n * 100) / 100;
}

function parseOptionalCoord(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} inválida.`);
  }
  return n;
}

/** Aceita ISO timestamptz ou string parseável; rejeita inválidos. */
function parseOptionalTimestamp(value: unknown, field: string): string | null {
  const s = cleanText(value, 64);
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw new Error(`${field} inválida.`);
  return new Date(ms).toISOString();
}

function assertRange(
  start: string | null,
  end: string | null,
  startLabel: string,
  endLabel: string,
) {
  if (start && end && Date.parse(end) < Date.parse(start)) {
    throw new Error(`${endLabel} não pode ser anterior a ${startLabel}.`);
  }
}

/**
 * Valida e normaliza payload de criação/edição de operação.
 * Código (OS-YYYY-NNNN) é gerado somente no backend — ignorado se enviado.
 * COMPLETED exige actual_end (validado aqui e reforçado na transição).
 */
export function validateTopographyOperationInput(
  raw: Record<string, unknown>,
  opts?: { previousStatus?: OperationStatusCode },
): MasterTopographyOperationInput {
  const title = cleanRequired(raw.title, 'Título', 240);

  const statusRaw = String(raw.status || 'DRAFT').trim();
  if (!isOperationStatus(statusRaw)) throw new Error('Status inválido.');

  const priorityRaw = String(raw.priority || 'NORMAL').trim();
  if (!isOperationPriority(priorityRaw)) throw new Error('Prioridade inválida.');

  const scheduled_start = parseOptionalTimestamp(
    raw.scheduled_start ?? raw.scheduledStart,
    'Início agendado',
  );
  const scheduled_end = parseOptionalTimestamp(
    raw.scheduled_end ?? raw.scheduledEnd,
    'Fim agendado',
  );
  assertRange(scheduled_start, scheduled_end, 'início agendado', 'Fim agendado');

  const actual_start = parseOptionalTimestamp(
    raw.actual_start ?? raw.actualStart,
    'Início real',
  );
  const actual_end = parseOptionalTimestamp(raw.actual_end ?? raw.actualEnd, 'Fim real');
  assertRange(actual_start, actual_end, 'início real', 'Fim real');

  if (statusRaw === 'COMPLETED' && !actual_end) {
    throw new Error('Operação concluída exige data/hora de fim real (actual_end).');
  }

  if (opts?.previousStatus && opts.previousStatus !== statusRaw) {
    const transition = canTransitionOperationStatus(opts.previousStatus, statusRaw, {
      allowReopen: true,
    });
    if (!transition.ok) throw new Error(transition.message);
  }

  return {
    title,
    description: cleanText(raw.description, 8000),
    project_id: parseOptionalUuid(raw.project_id ?? raw.projectId, 'Projeto'),
    quote_id: parseOptionalUuid(raw.quote_id ?? raw.quoteId, 'Orçamento'),
    client_name: cleanText(raw.client_name ?? raw.clientName, 200),
    service_type: cleanText(raw.service_type ?? raw.serviceType, 160),
    status: statusRaw,
    priority: priorityRaw,
    scheduled_start,
    scheduled_end,
    actual_start,
    actual_end,
    location_name: cleanText(raw.location_name ?? raw.locationName, 200),
    address: cleanText(raw.address, 500),
    latitude: parseOptionalCoord(raw.latitude, 'Latitude', -90, 90),
    longitude: parseOptionalCoord(raw.longitude, 'Longitude', -180, 180),
    responsible_user_id: parseOptionalUuid(
      raw.responsible_user_id ?? raw.responsibleUserId,
      'Responsável',
    ),
    responsible_name: cleanText(raw.responsible_name ?? raw.responsibleName, 160),
    estimated_cost: parseOptionalMoney(
      raw.estimated_cost ?? raw.estimatedCost,
      'Custo estimado',
    ),
    actual_cost: parseOptionalMoney(raw.actual_cost ?? raw.actualCost, 'Custo real'),
    notes: cleanText(raw.notes, 8000),
  };
}

/** Valida mudança controlada de status (patchOnly). */
export function validateOperationStatusChange(
  from: OperationStatusCode,
  toRaw: unknown,
  opts?: { allowReopen?: boolean; actualEnd?: string | null },
): OperationStatusCode {
  const to = String(toRaw || '').trim();
  if (!isOperationStatus(to)) throw new Error('Status inválido.');

  const transition = canTransitionOperationStatus(from, to, {
    allowReopen: opts?.allowReopen !== false,
  });
  if (!transition.ok) throw new Error(transition.message);

  if (to === 'COMPLETED' && !opts?.actualEnd) {
    throw new Error('Operação concluída exige data/hora de fim real (actual_end).');
  }

  return to;
}
