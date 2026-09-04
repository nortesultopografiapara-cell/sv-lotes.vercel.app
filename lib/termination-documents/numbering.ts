/**
 * Numeração auditável TD-000000001/2026.
 * Sequência atômica por company_id + prefixo + ano (RPC).
 * Sem SELECT MAX + 1.
 */

export const TERMINATION_DOCUMENT_PREFIX_DESISTENCIA = 'TD';
export const TERMINATION_DOCUMENT_PREFIX_DISTRATO = 'DT';

export const TERMINATION_DOCUMENT_NUMBER_PATTERN = /^[A-Z]{2}-\d{9}\/\d{4}$/;

export function formatSaleOperationDocumentNumber(
  prefix: string,
  seq: number,
  year: number,
): string {
  const p = String(prefix || '')
    .trim()
    .toUpperCase();
  const n = Math.max(1, Math.floor(Number(seq) || 0));
  const y = Math.max(2000, Math.floor(Number(year) || 0));
  return `${p}-${String(n).padStart(9, '0')}/${y}`;
}

export function parseSaleOperationDocumentNumber(
  value: string | null | undefined,
): { prefix: string; seq: number; year: number } | null {
  const raw = String(value || '').trim().toUpperCase();
  const m = raw.match(/^([A-Z]{2})-(\d{9})\/(\d{4})$/);
  if (!m) return null;
  return { prefix: m[1], seq: Number(m[2]), year: Number(m[3]) };
}

export function isValidSaleOperationDocumentNumber(
  value: string | null | undefined,
): boolean {
  return parseSaleOperationDocumentNumber(value) != null;
}

export function currentDocumentYear(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'year')?.value || now.getFullYear());
}

export async function allocateSaleOperationDocumentNumber(
  admin: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  },
  companyId: string,
  prefix = TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
  year = currentDocumentYear(),
): Promise<string> {
  const cid = String(companyId || '').trim();
  if (!cid) throw new Error('DOCUMENT_NUMBER_COMPANY_REQUIRED');
  const { data, error } = await admin.rpc('next_sale_operation_document_number', {
    p_company_id: cid,
    p_prefix: prefix,
    p_year: year,
  });
  if (error || data == null) {
    throw new Error(
      `DOCUMENT_NUMBER_FAILED: ${error?.message || 'RPC next_sale_operation_document_number indisponível'}`,
    );
  }
  const number = String(data).trim();
  if (!isValidSaleOperationDocumentNumber(number)) {
    throw new Error(`DOCUMENT_NUMBER_INVALID: ${number}`);
  }
  return number;
}
