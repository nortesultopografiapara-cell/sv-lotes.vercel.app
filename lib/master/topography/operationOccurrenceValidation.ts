import {
  isOperationOccurrenceSeverity,
  isOperationOccurrenceStatus,
  isOperationOccurrenceType,
  type MasterTopographyOperationOccurrenceInput,
} from './operationOccurrenceTypes';

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseOptionalIso(raw: unknown, label: string): string | null {
  if (raw == null || raw === '') return null;
  const ms = Date.parse(String(raw));
  if (!Number.isFinite(ms)) throw new Error(`${label} inválido.`);
  return new Date(ms).toISOString();
}

export function validateOperationOccurrenceInput(
  raw: Record<string, unknown>,
): MasterTopographyOperationOccurrenceInput {
  const title = cleanText(raw.title, 300);
  if (!title) throw new Error('Título da ocorrência é obrigatório.');

  const type = String(raw.type || 'OTHER').trim();
  if (!isOperationOccurrenceType(type)) throw new Error('Tipo de ocorrência inválido.');

  const severity = String(raw.severity || 'MEDIUM').trim();
  if (!isOperationOccurrenceSeverity(severity)) throw new Error('Severidade inválida.');

  const status = String(raw.status || 'OPEN').trim();
  if (!isOperationOccurrenceStatus(status)) throw new Error('Status da ocorrência inválido.');

  let evidence: string | null = null;
  const ev = raw.evidence_document_id ?? raw.evidenceDocumentId;
  if (ev != null && String(ev).trim()) {
    const s = String(ev).trim();
    if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error('Documento de evidência inválido.');
    evidence = s;
  }

  return {
    type,
    severity,
    title,
    description: cleanText(raw.description, 4000),
    occurred_at: parseOptionalIso(raw.occurred_at ?? raw.occurredAt, 'Data da ocorrência'),
    action_taken: cleanText(raw.action_taken ?? raw.actionTaken, 4000),
    status,
    evidence_document_id: evidence,
  };
}
