/** Status de operação de campo — SV Topografia & Projetos (Master). */

export const OPERATION_STATUSES = [
  { code: 'DRAFT', label: 'Rascunho', color: '#94a3b8', order: 1, isFinal: false },
  { code: 'PLANNED', label: 'Planejada', color: '#0284c7', order: 2, isFinal: false },
  { code: 'SCHEDULED', label: 'Agendada', color: '#2563eb', order: 3, isFinal: false },
  { code: 'IN_FIELD', label: 'Em campo', color: '#d97706', order: 4, isFinal: false },
  { code: 'PROCESSING', label: 'Em processamento', color: '#7c3aed', order: 5, isFinal: false },
  { code: 'WAITING_CLIENT', label: 'Aguardando cliente', color: '#ea580c', order: 6, isFinal: false },
  { code: 'COMPLETED', label: 'Concluída', color: '#059669', order: 7, isFinal: true },
  { code: 'CANCELED', label: 'Cancelada', color: '#e11d48', order: 8, isFinal: true },
] as const;

export type OperationStatusCode = (typeof OPERATION_STATUSES)[number]['code'];

export const OPERATION_PRIORITIES = [
  { code: 'LOW', label: 'Baixa', order: 1 },
  { code: 'NORMAL', label: 'Normal', order: 2 },
  { code: 'HIGH', label: 'Alta', order: 3 },
  { code: 'URGENT', label: 'Urgente', order: 4 },
] as const;

export type OperationPriorityCode = (typeof OPERATION_PRIORITIES)[number]['code'];

/** Transições comuns (não finais). */
export const OPERATION_STATUS_TRANSITIONS: Record<
  OperationStatusCode,
  readonly OperationStatusCode[]
> = {
  DRAFT: ['PLANNED', 'CANCELED'],
  PLANNED: ['SCHEDULED', 'DRAFT', 'CANCELED'],
  SCHEDULED: ['IN_FIELD', 'PLANNED', 'CANCELED'],
  IN_FIELD: ['PROCESSING', 'CANCELED'],
  PROCESSING: ['WAITING_CLIENT', 'COMPLETED', 'IN_FIELD'],
  WAITING_CLIENT: ['PROCESSING', 'COMPLETED'],
  COMPLETED: [],
  CANCELED: [],
};

/**
 * Reabertura auditável por SUPER_ADMIN a partir de estados finais.
 * Destinos permitidos: DRAFT ou PLANNED.
 */
export const OPERATION_REOPEN_TARGETS = ['DRAFT', 'PLANNED'] as const;

export function isOperationStatus(value: string): value is OperationStatusCode {
  return OPERATION_STATUSES.some((s) => s.code === value);
}

export function isOperationPriority(value: string): value is OperationPriorityCode {
  return OPERATION_PRIORITIES.some((p) => p.code === value);
}

export function operationStatusMeta(code: string) {
  return OPERATION_STATUSES.find((s) => s.code === code) ?? null;
}

export function operationStatusLabel(code: string): string {
  return operationStatusMeta(code)?.label ?? code;
}

export function operationPriorityLabel(code: string): string {
  return OPERATION_PRIORITIES.find((p) => p.code === code)?.label ?? code;
}

/**
 * Valida transição de status.
 * @param allowReopen — true quando SUPER_ADMIN reabre COMPLETED/CANCELED (auditável).
 */
export function canTransitionOperationStatus(
  from: OperationStatusCode,
  to: OperationStatusCode,
  opts?: { allowReopen?: boolean },
): { ok: true } | { ok: false; message: string } {
  if (from === to) return { ok: true };

  const allowed = OPERATION_STATUS_TRANSITIONS[from] || [];
  if (allowed.includes(to)) return { ok: true };

  if (
    opts?.allowReopen &&
    (from === 'COMPLETED' || from === 'CANCELED') &&
    (OPERATION_REOPEN_TARGETS as readonly string[]).includes(to)
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    message: `Transição de status inválida: ${operationStatusLabel(from)} → ${operationStatusLabel(to)}.`,
  };
}
