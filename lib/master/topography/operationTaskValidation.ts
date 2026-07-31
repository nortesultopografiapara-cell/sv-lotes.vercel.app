import {
  isOperationTaskStatus,
  type MasterTopographyOperationTaskInput,
} from './operationTaskTypes';

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function validateOperationTaskInput(
  raw: Record<string, unknown>,
): MasterTopographyOperationTaskInput {
  const title = cleanText(raw.title, 300);
  if (!title) throw new Error('Título do item é obrigatório.');

  const statusRaw = String(raw.status || 'PENDING').trim();
  if (!isOperationTaskStatus(statusRaw)) throw new Error('Status do item inválido.');

  const orderRaw = raw.order_index ?? raw.orderIndex;
  let order_index = 0;
  if (orderRaw != null && orderRaw !== '') {
    order_index = Math.trunc(Number(orderRaw));
    if (!Number.isFinite(order_index)) throw new Error('Ordem inválida.');
  }

  return {
    title,
    description: cleanText(raw.description, 2000),
    is_required: Boolean(raw.is_required ?? raw.isRequired),
    is_critical: Boolean(raw.is_critical ?? raw.isCritical),
    status: statusRaw,
    order_index,
    notes: cleanText(raw.notes, 2000),
  };
}
