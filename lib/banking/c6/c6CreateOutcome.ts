/**
 * Classifica a resposta do POST /v1/bank_slips/.
 * HTTP 4xx só libera nova tentativa quando o corpo não traz identificador de boleto
 * e o status é uma rejeição de validação ou autorização. Conflito, limite e 5xx ficam incertos.
 */

export const C6_DEFINITIVE_REJECTION_STATUSES = [400, 401, 403, 404, 422] as const;

export type C6CreateDisposition = 'succeeded' | 'definitive_rejection' | 'uncertain';

const SLIP_ID_KEYS = ['id', 'bank_slip_id', 'bankSlipId'] as const;

export function c6ResponseSlipId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of SLIP_ID_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function isC6DefinitiveRejectionStatus(httpStatus: number | null | undefined): boolean {
  return C6_DEFINITIVE_REJECTION_STATUSES.includes(
    Number(httpStatus) as (typeof C6_DEFINITIVE_REJECTION_STATUSES)[number],
  );
}

export function classifyC6CreateResponse(
  httpStatus: number | null,
  body: unknown,
): { disposition: C6CreateDisposition; bankSlipId: string | null } {
  const bankSlipId = c6ResponseSlipId(body);
  if (httpStatus === 201 && bankSlipId) {
    return { disposition: 'succeeded', bankSlipId };
  }
  if (isC6DefinitiveRejectionStatus(httpStatus) && !bankSlipId) {
    return { disposition: 'definitive_rejection', bankSlipId: null };
  }
  return { disposition: 'uncertain', bankSlipId };
}
