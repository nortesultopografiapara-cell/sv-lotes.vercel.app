import {
  isEquipmentMaintenanceStatus,
  isEquipmentMaintenanceType,
  type MasterTopographyEquipmentMaintenanceInput,
} from './equipmentMaintenanceTypes';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanRequired(value: unknown, field: string, max = 2000): string {
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

function parseOptionalMoney(value: unknown, field = 'Custo'): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} não pode ser negativo.`);
  }
  return Math.round(n * 100) / 100;
}

export function validateEquipmentMaintenanceInput(
  raw: Record<string, unknown>,
): MasterTopographyEquipmentMaintenanceInput {
  const tipoRaw = String(raw.tipo ?? raw.type ?? '').trim().toUpperCase();
  if (!isEquipmentMaintenanceType(tipoRaw)) {
    throw new Error('Tipo de manutenção inválido.');
  }

  const statusRaw = String(raw.status || 'PLANNED').trim().toUpperCase();
  if (!isEquipmentMaintenanceStatus(statusRaw)) {
    throw new Error('Status de manutenção inválido.');
  }

  return {
    tipo: tipoRaw,
    status: statusRaw,
    description: cleanRequired(raw.description ?? raw.descricao, 'Descrição', 4000),
    supplier: cleanText(raw.supplier ?? raw.fornecedor, 200),
    scheduled_at: parseOptionalDate(
      raw.scheduled_at ?? raw.scheduledAt ?? raw.data_prevista,
      'Data prevista',
    ),
    performed_at: parseOptionalDate(
      raw.performed_at ?? raw.performedAt ?? raw.data_realizada,
      'Data realizada',
    ),
    cost: parseOptionalMoney(raw.cost ?? raw.custo, 'Custo'),
    next_review_at: parseOptionalDate(
      raw.next_review_at ?? raw.nextReviewAt ?? raw.proxima_revisao,
      'Próxima revisão',
    ),
    parts: cleanText(raw.parts ?? raw.pecas, 4000),
    notes: cleanText(raw.notes ?? raw.observacoes, 4000),
  };
}

export function validateEquipmentMaintenancePatch(
  raw: Record<string, unknown>,
): Partial<MasterTopographyEquipmentMaintenanceInput> & {
  is_archived?: boolean;
} {
  const out: Partial<MasterTopographyEquipmentMaintenanceInput> & {
    is_archived?: boolean;
  } = {};

  if (raw.tipo != null || raw.type != null) {
    const tipoRaw = String(raw.tipo ?? raw.type).trim().toUpperCase();
    if (!isEquipmentMaintenanceType(tipoRaw)) {
      throw new Error('Tipo de manutenção inválido.');
    }
    out.tipo = tipoRaw;
  }

  if (raw.status != null) {
    const statusRaw = String(raw.status).trim().toUpperCase();
    if (!isEquipmentMaintenanceStatus(statusRaw)) {
      throw new Error('Status de manutenção inválido.');
    }
    out.status = statusRaw;
  }

  if (raw.description != null || raw.descricao != null) {
    out.description = cleanRequired(raw.description ?? raw.descricao, 'Descrição', 4000);
  }
  if (raw.supplier != null || raw.fornecedor != null) {
    out.supplier = cleanText(raw.supplier ?? raw.fornecedor, 200);
  }
  if (
    raw.scheduled_at != null ||
    raw.scheduledAt != null ||
    raw.data_prevista != null
  ) {
    out.scheduled_at = parseOptionalDate(
      raw.scheduled_at ?? raw.scheduledAt ?? raw.data_prevista,
      'Data prevista',
    );
  }
  if (
    raw.performed_at != null ||
    raw.performedAt != null ||
    raw.data_realizada != null
  ) {
    out.performed_at = parseOptionalDate(
      raw.performed_at ?? raw.performedAt ?? raw.data_realizada,
      'Data realizada',
    );
  }
  if (raw.cost != null || raw.custo != null) {
    out.cost = parseOptionalMoney(raw.cost ?? raw.custo, 'Custo');
  }
  if (
    raw.next_review_at != null ||
    raw.nextReviewAt != null ||
    raw.proxima_revisao != null
  ) {
    out.next_review_at = parseOptionalDate(
      raw.next_review_at ?? raw.nextReviewAt ?? raw.proxima_revisao,
      'Próxima revisão',
    );
  }
  if (raw.parts != null || raw.pecas != null) {
    out.parts = cleanText(raw.parts ?? raw.pecas, 4000);
  }
  if (raw.notes != null || raw.observacoes != null) {
    out.notes = cleanText(raw.notes ?? raw.observacoes, 4000);
  }
  if (raw.is_archived != null || raw.isArchived != null) {
    out.is_archived = Boolean(raw.is_archived ?? raw.isArchived);
  }

  if (Object.keys(out).length === 0) {
    throw new Error('Nada para atualizar.');
  }
  return out;
}
